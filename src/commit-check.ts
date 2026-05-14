/**
 * Local hook helper: validate commit messages, branch names, and staged files.
 * Used by lefthook (see lefthook.yml). Not part of the published library API.
 */
import { EntityBranch } from "./branch/branch";
import { EntityCommit } from "./commit/commit";

const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

const log = {
	info: (msg: string) => console.log(`\x1b[34m${msg}\x1b[0m`),
	ok: (msg: string) => console.log(`\x1b[32m${msg}\x1b[0m`),
	warn: (msg: string) => console.log(`\x1b[33m${msg}\x1b[0m`),
	gray: (msg: string) => console.log(`\x1b[90m${msg}\x1b[0m`),
};

function parseFlags(argv: string[]): {
	message?: string;
	messageFile?: string;
	branch: boolean;
	staged: boolean;
} {
	let message: string | undefined;
	let messageFile: string | undefined;
	let branch = false;
	let staged = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--branch" || a === "-b") {
			branch = true;
		} else if (a === "--staged" || a === "-s") {
			staged = true;
		} else if (a === "--message" || a === "-m") {
			message = argv[i + 1];
			i++;
		} else if (a === "--message-file" || a === "-f") {
			messageFile = argv[i + 1];
			i++;
		}
	}

	return { message, messageFile, branch, staged };
}

function fail(message: string): never {
	console.error(`\x1b[31m${message}\x1b[0m`);
	process.exit(1);
}

async function readCommitMessageFromFile(path: string): Promise<string> {
	const raw = await Bun.file(path).text();
	return raw
		.trimEnd()
		.split("\n")
		.filter((line) => line.trim() && !line.trim().startsWith("#"))
		.join("\n");
}

async function main(): Promise<void> {
	const { message, messageFile, branch, staged } = parseFlags(process.argv.slice(2));
	const entityCommit = new EntityCommit();
	const branchInstance = new EntityBranch();

	if (messageFile || message) {
		log.info("🔍 Validating commit message from file...");
		const commitMessage = messageFile ? await readCommitMessageFromFile(messageFile) : message;
		if (!commitMessage?.trim()) {
			fail("❌ No commit message found");
		}

		const validation = entityCommit.validateCommitMessage(commitMessage.trimEnd());
		if (validation.length > 0) {
			fail(
				"❌ Commit message validation failed:\n" +
					validation.map((error) => `  • ${error}`).join("\n"),
			);
		}

		log.ok("✅ Commit message validation passed");
	}

	if (branch) {
		try {
			log.info("🔍 Running branch name validation...");
			const branchName =
				process.env.GITHUB_HEAD_REF ||
				process.env.GITHUB_REF?.replace("refs/heads/", "") ||
				(await branchInstance.getCurrentBranch()) ||
				"";

			const branchValidation = branchInstance.validate(branchName);
			if (typeof branchValidation === "string") {
				if (isCI) {
					log.warn("⚠️  Skipping branch name check in CI environment");
					log.gray(`Branch name detected: ${branchName}`);
				} else {
					throw new Error(branchValidation);
				}
			}

			log.ok("✅ Branch name validation passed");
		} catch (error) {
			fail(
				"❌ Branch name validation failed:\n" +
					(error instanceof Error ? error.message.split("\n") : [String(error)])
						.map((e) => `  • ${e}`)
						.join("\n"),
			);
		}
	}

	if (staged) {
		try {
			log.info("🔍 Running staged files validation...");
			const { stagedFiles } = await entityCommit.getStagedFiles();
			if (!stagedFiles.length) {
				log.ok("✅ No staged changes");
			} else {
				const errors = await entityCommit.validateStagedFiles(stagedFiles);
				if (errors.length === 0) {
					log.ok("✅ No policy violations found in staged files");
				} else {
					throw new Error(errors.join("\n"));
				}
			}
		} catch (error) {
			fail(
				"❌ Staged files validation failed:\n" +
					(error instanceof Error ? error.message.split("\n") : [String(error)])
						.map((e) => `  • ${e.trim()}`)
						.join("\n"),
			);
		}
	}
}

await main();
