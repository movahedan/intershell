import path from "node:path";
import { colorify } from "./colorify";

const NPM_TOKEN_ENV_KEYS = ["NPM_TOKEN", "NODE_AUTH_TOKEN"] as const;

/** Load `.env` into process.env when keys are not already set (Bun also loads it for `bun run`). */
export async function loadProjectEnvFile(cwd = process.cwd()): Promise<void> {
	const envPath = path.join(cwd, ".env");
	const file = Bun.file(envPath);
	if (!(await file.exists())) {
		return;
	}

	const text = await file.text();
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq === -1) {
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		if (process.env[key] !== undefined) {
			continue;
		}
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

export function resolveNpmTokenFromEnv(): string | undefined {
	for (const key of NPM_TOKEN_ENV_KEYS) {
		const value = process.env[key]?.trim();
		if (value) {
			return value;
		}
	}
	return undefined;
}

/** Mirror token into NPM_TOKEN so project `.npmrc` (${NPM_TOKEN}) expands correctly. */
export function syncNpmTokenEnv(): string | undefined {
	const token = resolveNpmTokenFromEnv();
	if (token && !process.env.NPM_TOKEN?.trim()) {
		process.env.NPM_TOKEN = token;
	}
	return token ?? process.env.NPM_TOKEN?.trim();
}

export async function npmWhoami(): Promise<string | null> {
	const proc = Bun.spawn(["npm", "whoami"], {
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	const code = await proc.exited;
	if (code !== 0) {
		return null;
	}
	const user = (await new Response(proc.stdout).text()).trim();
	return user.length > 0 ? user : null;
}

/**
 * Ensures npm registry credentials exist before publish.
 * Uses NPM_TOKEN / NODE_AUTH_TOKEN (e.g. from `.env`) via project `.npmrc`, then interactive `npm login`.
 */
export async function ensureNpmAuthenticated(options: {
	readonly allowInteractiveLogin: boolean;
	readonly cwd?: string;
}): Promise<void> {
	const cwd = options.cwd ?? process.cwd();
	await loadProjectEnvFile(cwd);
	const token = syncNpmTokenEnv();

	const existing = await npmWhoami();
	if (existing !== null) {
		console.log(colorify.green(`✅ npm logged in as ${existing}`));
		return;
	}

	if (token) {
		throw new Error(
			"NPM_TOKEN (or NODE_AUTH_TOKEN) is set but npm whoami failed. Check the token is valid, not expired, and has publish access for this package. Create one at https://www.npmjs.com/settings/~tokens",
		);
	}

	if (!options.allowInteractiveLogin) {
		throw new Error(
			"Not logged in to npm. Set NPM_TOKEN in .env (see .env.example or README) or run npm login in an interactive terminal, then re-run version:publish.",
		);
	}

	console.log(colorify.yellow("⚠️  Not logged in to npm."));
	console.log(
		colorify.blue(
			"Starting npm login — complete the prompts; publish continues when login succeeds.",
		),
	);

	const loginProc = Bun.spawn(["npm", "login"], {
		cwd,
		stdio: ["inherit", "inherit", "inherit"],
		env: process.env,
	});
	const loginCode = await loginProc.exited;
	if (loginCode !== 0) {
		throw new Error("npm login failed or was cancelled.");
	}

	const user = await npmWhoami();
	if (user === null) {
		throw new Error(
			"npm login finished but npm whoami still failed. Check ~/.npmrc and your registry (npm config get registry).",
		);
	}

	console.log(colorify.green(`✅ npm logged in as ${user}`));
}
