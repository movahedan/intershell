import { $ } from "bun";
import { entitiesShell } from "../../src/entities.shell";
import { EntityPackage } from "../../src/package";
import { EntityPackageTags } from "../../src/package-tags";
import { colorify } from "../colorify";
import { printCliErrorAndExit } from "../format-cli-error";

interface ApplyFlags {
	readonly packageName: string;
	readonly message?: string;
	readonly noPush: boolean;
	readonly dryRun: boolean;
}

function printHelp(): void {
	console.log(`Create git version tags and commit version changes

Usage:
  bun run version:apply [options]

Options:
  -p, --package <name>   Package name (default: root)
  -m, --message <text>   Tag message
  -n, --no-push          Do not push to remote after creating tag
  -d, --dry-run          Show planned actions only
  -h, --help             Show this help
`);
}

function parseApplyArgv(argv: string[]): ApplyFlags {
	let packageName: string | undefined;
	let message: string | undefined;
	let noPush = false;
	let dryRun = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = argv[i + 1];

		if (a === "--help" || a === "-h") {
			continue;
		}
		if (a === "--no-push" || a === "-n") {
			noPush = true;
			continue;
		}
		if (a === "--dry-run" || a === "-d") {
			dryRun = true;
			continue;
		}
		if (a === "-p" || a === "--package") {
			packageName = next;
			i++;
			continue;
		}
		if (a.startsWith("--package=")) {
			packageName = a.slice("--package=".length);
			continue;
		}
		if (a === "-m" || a === "--message") {
			message = next;
			i++;
			continue;
		}
		if (a.startsWith("--message=")) {
			message = a.slice("--message=".length);
			continue;
		}
		if (a.startsWith("-")) {
			throw new Error(`Unknown option: ${a}`);
		}
	}

	return {
		packageName: packageName || "root",
		message,
		noPush,
		dryRun,
	};
}

async function commitVersionChanges(): Promise<void> {
	const commitMessage = await Bun.file(".git/COMMIT_EDITMSG").text();

	console.log("📝 Commit message:");
	console.log(commitMessage);

	await $`git commit -m "${commitMessage}" --no-verify`;

	console.log(colorify.green("✅ Successfully committed version changes"));
	const commitHash = await $`git rev-parse --short HEAD`.text();
	console.log(`🏷️ Commit hash: ${commitHash.trim()}`);
}

async function createTagsForPackage(
	packageName: string,
	flags: Pick<ApplyFlags, "message" | "noPush" | "dryRun">,
): Promise<string> {
	const packageInstance = new EntityPackage(packageName);
	const version = packageInstance.readVersion();
	if (!version) {
		throw new Error(`Version not found for ${packageName}`);
	}
	const packageTags = new EntityPackageTags(packageInstance);

	const tagExists = await packageTags.packageTagExists(version);
	if (tagExists) {
		const prefix = await packageTags.getTagPrefix();
		const tagName = `${prefix}${version}`;
		console.log(`⏭️ Tag already exists: ${tagName}`);
		return tagName;
	}

	console.log(`🏷️ Creating tag for ${packageName}: ${version}`);

	try {
		const tagName = await packageTags.createPackageTag(version);
		await entitiesShell.gitTag(
			tagName,
			flags.message || `Release ${packageName} version ${version}`,
			{ force: "-f" },
		);

		console.log(`✅ Created tag: ${tagName}`);
		return tagName;
	} catch (error) {
		throw new Error(
			`Failed to create tag for ${packageName}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function pushChanges(
	flags: Pick<ApplyFlags, "noPush" | "dryRun">,
	tagName: string,
): Promise<void> {
	if (flags.noPush) {
		console.log(colorify.yellow("⚠️ Skipping push (--no-push specified)"));
		return;
	}

	if (flags.dryRun) {
		console.log(colorify.yellow("⚠️ Skipping push (--dry-run specified)"));
		return;
	}

	try {
		console.log("📤 Pushing commit changes to remote...");
		const branch = await entitiesShell.gitBranchShowCurrent();
		await entitiesShell.gitPush(branch.text().trim());
		await entitiesShell.gitPushTag(tagName);
		console.log(`✅ Pushed commit changes and tag ${tagName} to remote`);
	} catch (error) {
		throw new Error(
			`Failed to push commit changes to remote: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h")) {
		printHelp();
		return;
	}

	const flags = parseApplyArgv(argv);
	const packageName = flags.packageName;
	console.log(`📦 Processing package: ${colorify.blue(packageName)}`);

	const packageInstance = new EntityPackage(packageName);
	const version = packageInstance.readVersion();
	const tagSeriesName = packageInstance.getTagSeriesName();
	const tagName = `${tagSeriesName}${version}`;

	if (!tagSeriesName) {
		throw new Error(
			`Tag series name not found for ${packageName}, this package should not be versioned (private package). Only versioned packages can be processed.`,
		);
	}

	if (flags.dryRun) {
		console.log(colorify.yellow("🔍 Dry run mode - would execute:"));
		console.log(colorify.gray(`  • Commit version changes for package ${packageName}`));
		console.log(colorify.gray(`  • Create tag ${tagName} for ${packageName}`));
		if (!flags.noPush) {
			console.log(colorify.gray("  • Push commit changes to remote"));
			console.log(colorify.gray("  • Push tags to remote"));
		}
		return;
	}

	console.log("📁 Adding all changes...");
	await $`git add .`;
	const statusResult = await $`git status --porcelain`.nothrow();
	const hasChanges = statusResult.text().trim() !== "";

	if (!hasChanges) {
		console.log(colorify.yellow("⚠️ No changes to commit"));
		return;
	}

	await commitVersionChanges();
	const tagNameToPush = await createTagsForPackage(packageName, flags);
	await pushChanges(flags, tagNameToPush);

	console.log(colorify.green("✅ Version apply operation completed successfully!"));
}

try {
	await main();
} catch (error) {
	printCliErrorAndExit(error);
}
