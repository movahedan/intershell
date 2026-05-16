import { colorify } from "./colorify";

export async function npmWhoami(): Promise<string | null> {
	const proc = Bun.spawn(["npm", "whoami"], {
		stdout: "pipe",
		stderr: "pipe",
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
 * In an interactive terminal, runs `npm login` and waits for completion.
 */
export async function ensureNpmAuthenticated(options: {
	readonly allowInteractiveLogin: boolean;
}): Promise<void> {
	const existing = await npmWhoami();
	if (existing !== null) {
		console.log(colorify.green(`✅ npm logged in as ${existing}`));
		return;
	}

	if (!options.allowInteractiveLogin) {
		throw new Error(
			"Not logged in to npm. Run npm login in an interactive terminal, or set NPM_TOKEN for CI, then re-run version:publish.",
		);
	}

	console.log(colorify.yellow("⚠️  Not logged in to npm."));
	console.log(
		colorify.blue(
			"Starting npm login — complete the prompts; publish continues when login succeeds.",
		),
	);

	const loginProc = Bun.spawn(["npm", "login"], {
		stdio: ["inherit", "inherit", "inherit"],
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
