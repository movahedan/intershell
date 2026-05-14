import path from "node:path";
import { $ } from "bun";
import { EntityPackage, EntityPackageTags } from "../../src/index";
import { colorify } from "../colorify";

interface PublishFlags {
	readonly packageName: string;
	readonly dryRun: boolean;
	readonly skipBuild: boolean;
	readonly skipValidation: boolean;
	readonly noTagCheck: boolean;
	readonly npmTag: string | undefined;
}

function printHelp(): void {
	console.log(`Build and publish the current package.json version to npm

Uses the version already in package.json (no bump). After version:prepare and
version:apply, run this to ship that exact version.

Usage:
  bun run version:publish [options]
  bun run ./scripts/version/publish.ts [options]

Options:
  -p, --package <name>   Package name (default: root)
  -d, --dry-run          npm publish --dry-run only
      --skip-build       Do not run bun run build first
      --skip-validation  Skip EntityPackage.validateAllPackages()
      --no-tag-check     Do not require a local git tag for the current version
      --tag <dist-tag>   npm dist-tag (passed to npm publish --tag)
  -h, --help             Show this help
`);
}

function parsePublishArgv(argv: string[]): PublishFlags {
	let packageName: string | undefined;
	let dryRun = false;
	let skipBuild = false;
	let skipValidation = false;
	let noTagCheck = false;
	let npmTag: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = argv[i + 1];

		if (a === "--help" || a === "-h") {
			continue;
		}
		if (a === "--dry-run" || a === "-d") {
			dryRun = true;
			continue;
		}
		if (a === "--skip-build") {
			skipBuild = true;
			continue;
		}
		if (a === "--skip-validation") {
			skipValidation = true;
			continue;
		}
		if (a === "--no-tag-check") {
			noTagCheck = true;
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
		if (a === "--tag") {
			npmTag = next;
			i++;
			continue;
		}
		if (a.startsWith("--tag=")) {
			npmTag = a.slice("--tag=".length);
			continue;
		}
		if (a.startsWith("-")) {
			throw new Error(`Unknown option: ${a}`);
		}
	}

	const resolvedNpmTag = npmTag?.trim();
	if (npmTag !== undefined && resolvedNpmTag === "") {
		throw new Error("--tag must be a non-empty dist-tag name");
	}

	return {
		packageName: packageName || "root",
		dryRun,
		skipBuild,
		skipValidation,
		noTagCheck,
		npmTag: resolvedNpmTag,
	};
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

	const flags = parsePublishArgv(argv);
	const packageName = flags.packageName;
	const packageInstance = new EntityPackage(packageName);
	const tagSeries = packageInstance.getTagSeriesName();

	if (!tagSeries) {
		die(
			`Package "${packageName}" is not publishable (private or missing tag series). Only versioned packages can be published.`,
		);
	}

	const pkgJson = packageInstance.readJson();
	if (pkgJson.private === true) {
		die(`Package "${packageName}" has private: true; refusing to publish.`);
	}

	const version = packageInstance.readVersion();
	if (!version) {
		die(`No version field in ${packageInstance.getJsonPath()}`);
	}

	console.log(`📦 ${colorify.blue(packageName)} @ ${colorify.green(version)} (from package.json)`);

	if (!flags.skipValidation) {
		console.log("🔍 Validating packages...");
		const validationResult = await EntityPackage.validateAllPackages();
		if (validationResult.length > 0) {
			die(`Package validation failed:\n${validationResult.map((e) => `  • ${e}`).join("\n")}`);
		}
		console.log(colorify.green("✅ Validation passed"));
	}

	const packageTags = new EntityPackageTags(packageInstance);
	if (!flags.noTagCheck) {
		const tagOk = await packageTags.packageTagExists(version);
		if (!tagOk) {
			const prefix = await packageTags.getTagPrefix();
			die(
				`No local git tag ${prefix}${version}. Create it with ${colorify.blue("bun run version:apply")} (after version:prepare), or pass ${colorify.blue("--no-tag-check")} if you intend to publish without that tag.`,
			);
		}
		console.log(colorify.green(`✅ Git tag exists for ${version}`));
	} else {
		console.log(colorify.yellow("⚠️ Skipping git tag check (--no-tag-check)"));
	}

	const publishCwd = path.resolve(packageInstance.getPath());

	if (!flags.skipBuild) {
		console.log(`🔨 Building in ${publishCwd}...`);
		await $`bun run build`.cwd(publishCwd);
		console.log(colorify.green("✅ Build finished"));
	}

	const npmParts = ["npm", "publish"];
	if (flags.dryRun) {
		npmParts.push("--dry-run");
	}
	if (flags.npmTag) {
		npmParts.push("--tag", flags.npmTag);
	}

	console.log(
		flags.dryRun
			? colorify.yellow("📤 npm publish --dry-run (no upload)")
			: colorify.green("📤 Publishing to npm..."),
	);
	const publishProc = Bun.spawn(npmParts, {
		cwd: publishCwd,
		stdio: ["inherit", "inherit", "inherit"],
	});
	const exitCode = await publishProc.exited;
	if (exitCode !== 0) {
		die(`npm publish exited with code ${exitCode}`);
	}

	console.log(colorify.green("✅ Done"));
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
