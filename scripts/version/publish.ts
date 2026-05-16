import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { $ } from "bun";
import { DefaultChangelogTemplate, EntityPackage, EntityPackageTags } from "../../src/index";
import { colorify } from "../colorify";
import { printCliErrorAndExit } from "../format-cli-error";

interface PublishFlags {
	readonly packageName: string;
	readonly dryRun: boolean;
	readonly skipBuild: boolean;
	readonly skipValidation: boolean;
	readonly noTagCheck: boolean;
	readonly npmTag: string | undefined;
	readonly noGithub: boolean;
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
      --no-github        Skip GitHub release (after a real npm publish, runs gh by default)
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
	let noGithub = false;

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
		if (a === "--no-github") {
			noGithub = true;
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
		noGithub,
	};
}

function die(message: string): never {
	console.error(message);
	process.exit(1);
}

/** Parsed version section from CHANGELOG.md (ChangelogTemplate.parseVersions via DefaultChangelogTemplate). */
function getReleaseNotesForVersion(packageInstance: EntityPackage, version: string): string | null {
	const prefix = packageInstance.getTagSeriesName();
	if (!prefix) {
		return null;
	}
	const template = new DefaultChangelogTemplate(packageInstance.getName(), prefix);
	const byVersion = template.parseVersions(packageInstance.readChangelog());
	const block = byVersion.get(version);
	if (typeof block !== "string") {
		return null;
	}
	const trimmed = block.trim();
	return trimmed.length > 0 ? trimmed : null;
}

async function resolveGitRoot(): Promise<string | null> {
	const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const code = await proc.exited;
	if (code !== 0) {
		return null;
	}
	const out = await new Response(proc.stdout).text();
	const root = out.trim();
	return root.length > 0 ? root : null;
}

async function ghCliAvailable(): Promise<boolean> {
	const proc = Bun.spawn(["gh", "--version"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const code = await proc.exited;
	return code === 0;
}

async function githubReleaseExists(tag: string, gitRoot: string): Promise<boolean> {
	const proc = Bun.spawn(["gh", "release", "view", tag], {
		cwd: gitRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const code = await proc.exited;
	return code === 0;
}

/**
 * After npm publish: create a GitHub release for the version tag, or update notes if it exists.
 */
async function syncGithubRelease(options: {
	readonly gitRoot: string;
	readonly tag: string;
	readonly title: string;
	readonly notesFilePath: string | null;
}): Promise<void> {
	const { gitRoot, tag, title, notesFilePath } = options;
	const exists = await githubReleaseExists(tag, gitRoot);
	const hasNotesFile = notesFilePath !== null;

	let args: string[];
	if (exists) {
		args = ["gh", "release", "edit", tag, "--title", title];
		if (hasNotesFile) {
			args.push("--notes-file", notesFilePath);
		}
	} else {
		args = ["gh", "release", "create", tag, "--verify-tag", "--title", title];
		if (hasNotesFile) {
			args.push("--notes-file", notesFilePath);
		} else {
			args.push("--generate-notes");
		}
	}

	console.log(
		exists
			? colorify.green(`🐙 Updating GitHub release ${tag}...`)
			: colorify.green(`🐙 Creating GitHub release ${tag}...`),
	);
	const proc = Bun.spawn(args, {
		cwd: gitRoot,
		stdio: ["inherit", "inherit", "inherit"],
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		die(`gh ${exists ? "release edit" : "release create"} exited with code ${exitCode}`);
	}
	console.log(colorify.green("✅ GitHub release synced"));
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

	if (!flags.dryRun && !flags.noGithub) {
		const gitRoot = await resolveGitRoot();
		if (!gitRoot) {
			console.log(colorify.yellow("⚠️ Not a git repo; skipping GitHub release"));
		} else if (!(await ghCliAvailable())) {
			console.log(
				colorify.yellow(
					"⚠️ GitHub CLI (gh) not found; skipping GitHub release. Install gh and re-run, or use --no-github.",
				),
			);
		} else {
			const gitTag = await packageTags.createPackageTag(version);
			const fullChangelog = packageInstance.readChangelog();
			const section = getReleaseNotesForVersion(packageInstance, version);
			const releaseTitle = `${pkgJson.name}@${version}`;

			let notesFilePath: string | null = null;
			let tmpDir: string | null = null;
			if (section !== null && section.trim().length > 0) {
				tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "intershell-gh-release-"));
				notesFilePath = path.join(tmpDir, "NOTES.md");
				await Bun.write(notesFilePath, section);
			} else if (fullChangelog.trim().length > 0) {
				console.log(
					colorify.yellow(
						`⚠️ No CHANGELOG section parsed for version ${version} (ChangelogTemplate.parseVersions); GitHub will use auto-generated notes on create or leave notes unchanged on edit.`,
					),
				);
			}

			try {
				await syncGithubRelease({
					gitRoot,
					tag: gitTag,
					title: releaseTitle,
					notesFilePath,
				});
			} finally {
				if (tmpDir !== null) {
					await fs.rm(tmpDir, { recursive: true, force: true });
				}
			}
		}
	} else if (flags.dryRun && !flags.noGithub) {
		console.log(colorify.yellow("⚠️ Skipping GitHub release (npm publish was --dry-run)"));
	} else if (flags.noGithub) {
		console.log(colorify.yellow("⚠️ Skipping GitHub release (--no-github)"));
	}

	console.log(colorify.green("✅ Done"));
}

try {
	await main();
} catch (error) {
	printCliErrorAndExit(error);
}
