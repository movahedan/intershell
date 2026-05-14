import fs from "node:fs";
import { $ } from "bun";
import {
	DefaultChangelogTemplate,
	EntityCompose,
	EntityPackage,
	EntityPackageChangelog,
	EntityPackageCommits,
	EntityPackageTags,
	EntityPackageVersion,
	type EntityPackageVersionBumpType,
	EntityTag,
} from "../../src/index";
import { colorify } from "../colorify";

const bumpTypeOptions = ["major", "minor", "patch", "none"] as EntityPackageVersionBumpType[];

interface PrepareFlags {
	readonly packageName: string;
	readonly from?: string;
	readonly to?: string;
	readonly fromVersion?: string;
	readonly toVersion?: string;
	readonly bumpType?: EntityPackageVersionBumpType;
}

function printHelp(): void {
	console.log(`Prepare version bumps and generate changelogs for packages

Usage:
  bun run version:prepare [options]

Options:
  -p, --package <name>       Package name (default: root)
  -f, --from <ref>           Start commit/tag for changelog
  -t, --to <ref>             End commit/tag (default: HEAD)
      --from-version <ver>   Start version (resolved to package tag)
      --to-version <ver>     End version (resolved to package tag)
      --bump-type <type>     Override bump: major | minor | patch | none
  -h, --help                 Show this help
`);
}

function parsePrepareArgv(argv: string[]): PrepareFlags {
	let packageName = "root";
	let from: string | undefined;
	let to: string | undefined;
	let fromVersion: string | undefined;
	let toVersion: string | undefined;
	let bumpType: EntityPackageVersionBumpType | undefined;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = argv[i + 1];

		if (a === "--help" || a === "-h") {
			continue;
		}
		if (a === "-p" || a === "--package") {
			packageName = next ?? "root";
			i++;
			continue;
		}
		if (a.startsWith("--package=")) {
			packageName = a.slice("--package=".length) || "root";
			continue;
		}
		if (a === "-f" || a === "--from") {
			from = next;
			i++;
			continue;
		}
		if (a.startsWith("--from=")) {
			from = a.slice("--from=".length);
			continue;
		}
		if (a === "-t" || a === "--to") {
			to = next;
			i++;
			continue;
		}
		if (a.startsWith("--to=")) {
			to = a.slice("--to=".length);
			continue;
		}
		if (a === "--from-version") {
			fromVersion = next;
			i++;
			continue;
		}
		if (a.startsWith("--from-version=")) {
			fromVersion = a.slice("--from-version=".length);
			continue;
		}
		if (a === "--to-version") {
			toVersion = next;
			i++;
			continue;
		}
		if (a.startsWith("--to-version=")) {
			toVersion = a.slice("--to-version=".length);
			continue;
		}
		if (a === "--bump-type") {
			const v = next;
			if (!v || !bumpTypeOptions.includes(v as EntityPackageVersionBumpType)) {
				throw new Error(`--bump-type must be one of: ${bumpTypeOptions.join(", ")}`);
			}
			bumpType = v as EntityPackageVersionBumpType;
			i++;
			continue;
		}
		if (a.startsWith("--bump-type=")) {
			const v = a.slice("--bump-type=".length);
			if (!bumpTypeOptions.includes(v as EntityPackageVersionBumpType)) {
				throw new Error(`--bump-type must be one of: ${bumpTypeOptions.join(", ")}`);
			}
			bumpType = v as EntityPackageVersionBumpType;
			continue;
		}
		if (a.startsWith("-")) {
			throw new Error(`Unknown option: ${a}`);
		}
	}

	return {
		packageName,
		from,
		to,
		fromVersion,
		toVersion,
		bumpType,
	};
}

/**
 * Resolves from/to commits, handling version-to-tag conversion when needed
 */
async function resolveCommitRange({
	packageTags,
	from,
	to,
	fromVersion,
	toVersion,
}: {
	packageTags: EntityPackageTags;
	from?: string;
	to?: string;
	fromVersion?: string;
	toVersion?: string;
}): Promise<{ fromCommit: string; toCommit: string }> {
	let fromCommit: string;
	let toCommit: string;
	if (fromVersion) {
		const fromTag = `${await packageTags.getTagPrefix()}${fromVersion}`;
		console.log(`📝 Converting --from-version ${fromVersion} to tag: ${fromTag}`);
		fromCommit = await EntityTag.getBaseCommitSha(fromTag);
	} else if (from) {
		fromCommit = await EntityTag.getBaseCommitSha(from);
	} else {
		fromCommit = await packageTags.getBaseTagShaForPackage();
	}

	if (toVersion) {
		const toTag = `${await packageTags.getTagPrefix()}${toVersion}`;
		console.log(`📝 Converting --to-version ${toVersion} to tag: ${toTag}`);
		toCommit = await EntityTag.getBaseCommitSha(toTag);
	} else {
		toCommit = to || "HEAD";
	}

	return { fromCommit, toCommit };
}

function die(message: string): never {
	console.error(message);
	process.exit(1);
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h")) {
		printHelp();
		return;
	}

	const flags = parsePrepareArgv(argv);
	const packageName = flags.packageName;

	console.log("🔍 Validating package configurations...");
	const validationResult = await EntityPackage.validateAllPackages();
	if (validationResult.length > 0) {
		die(
			`❌ Package validation failed!\nFound ${validationResult.length} validation errors:\n${validationResult.map((error) => `  📦 ${error}`).join("\n")}`,
		);
	}
	console.log(colorify.green("✅ All packages passed validation"));

	const allVersionedPackages = await EntityPackage.getVersionedPackages();
	const packageInstance = new EntityPackage(packageName);
	const packageTags = new EntityPackageTags(packageInstance);
	const packageCommits = new EntityPackageCommits(packageInstance);
	const packageVersion = new EntityPackageVersion(packageInstance, packageCommits, packageTags);
	const prefix = packageInstance.getTagSeriesName();

	if (!allVersionedPackages.includes(packageName)) {
		throw new Error(
			`Package "${packageName}" should not be versioned (private package). Only versioned packages can be processed.`,
		);
	}
	if (!prefix) {
		throw new Error(
			`Tag series name not found for ${packageName}, this package should not be versioned (private package). Only versioned packages can be processed.`,
		);
	}

	console.log(`🚀 Starting version preparation for package ${colorify.blue(packageName)}`);
	const { fromCommit, toCommit } = await resolveCommitRange({
		packageTags,
		from: flags.from,
		to: flags.to,
		fromVersion: flags.fromVersion,
		toVersion: flags.toVersion,
	});

	const from =
		flags.from || flags.fromVersion ? fromCommit : await packageTags.getBaseTagShaForPackage();

	console.log(`📝 Generating changelog from ${colorify.blue(from)} to ${colorify.blue(toCommit)}`);

	const commits = await packageCommits.getCommitsInRange(from, toCommit);
	const overrideBumpType = flags.bumpType;
	const versionData = await packageVersion.calculateVersionData(commits, overrideBumpType);

	const template = new DefaultChangelogTemplate(packageName, prefix);
	const changelog = new EntityPackageChangelog(packageInstance, commits, {
		template,
		versionData,
		versionMode: true,
	});
	const changelogContent = changelog.generateMergedChangelog();

	if (commits.length === 0) {
		console.log(colorify.yellow(`📦 ${packageName}: ${colorify.yellow("No commits found")}`));
		return;
	}
	if (!versionData.shouldBump) {
		console.log(
			colorify.yellow(
				`📦 ${packageName}: ${colorify.yellow("No version bump needed")} (${versionData.bumpType})`,
			),
		);
		return;
	}

	console.log(
		`🔄 Updating package version from ${versionData.currentVersion} to ${versionData.targetVersion} in ${packageInstance.getJsonPath()}`,
	);
	await packageInstance.writeVersion(versionData.targetVersion);
	await $`bun install`;
	await packageInstance.writeChangelog(changelogContent);

	const tagName = `${prefix}${versionData.targetVersion}`;
	const versionCommitMessage = `release(${packageName}): ${tagName} [${versionData.bumpType}] (${versionData.currentVersion} => ${versionData.targetVersion})\n\n📝 Commits processed: ${commits.length}\n📝 Changelog updated: (${packageInstance.getChangelogPath()})`;
	console.log(
		`📦 (${colorify.yellow(versionData.currentVersion)} => ${colorify.green(versionData.targetVersion)}) ${colorify.blue(packageName)}: ${versionData.bumpType} (${colorify.green(packageInstance.getChangelogPath())})`,
	);
	await Bun.write(".git/COMMIT_EDITMSG", versionCommitMessage);
	console.log(
		`${colorify.green("📝 Commit message written in")} ${colorify.blue(".git/COMMIT_EDITMSG")}:`,
		`\n\t${versionCommitMessage.replace(/\n/g, "\n\t")}`,
	);

	try {
		const services = await new EntityCompose("docker-compose.yml").getServices();
		const servicesToDeploy = services.filter((s) => s.name === packageName).map((s) => s.name);
		if (servicesToDeploy.length > 0) {
			const servicesToDeployNames = servicesToDeploy.join(",");
			if (process.env.GITHUB_OUTPUT) {
				await fs.promises.appendFile(
					process.env.GITHUB_OUTPUT,
					`packages-to-deploy=${servicesToDeployNames}\n`,
				);
			}
			console.log(`\n🚀 Packages to deploy: ${colorify.blue(servicesToDeployNames)}`);
		}
	} catch (error) {
		console.log(
			colorify.yellow(`📦 ${packageName}: ${colorify.yellow("No services found")}: ${error}`),
		);
	}

	console.log(
		"\n📝 Next steps:\n" +
			"1. Review the generated changelogs\n" +
			`2. Run ${colorify.blue("bun run version:apply")} to commit, tag and push the versions (use --no-push to skip push)`,
	);
	console.log(colorify.green("✅ Version preparation completed!"));
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
