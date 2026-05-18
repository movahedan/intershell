import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PackageJson } from "./package.types";

export interface WorkspacePackageEntry {
	readonly relativePath: string;
	readonly name: string;
}

/** Scoped workspace package: `@scope/name` → filesystem path `scope/name` */
export function getWorkspacePackagePath(packageName: string): string | null {
	if (!packageName.startsWith("@") || !packageName.includes("/")) return null;
	return packageName.slice(1);
}

/** Last path segment of a scoped package (e.g. `@packages/ui` → `ui`) for service name matching */
export function stripWorkspaceScope(packageName: string): string {
	const workspacePath = getWorkspacePackagePath(packageName);
	if (workspacePath === null) return packageName;
	const slashIndex = workspacePath.lastIndexOf("/");
	return slashIndex === -1 ? workspacePath : workspacePath.slice(slashIndex + 1);
}

export function parseWorkspacePatterns(workspaces: PackageJson["workspaces"]): string[] {
	if (!workspaces) return [];
	if (Array.isArray(workspaces)) return workspaces;
	return workspaces.packages ?? [];
}

export function findWorkspaceRootSync(startDir: string = process.cwd()): string {
	let workspaceRoot = startDir;
	while (workspaceRoot !== dirname(workspaceRoot)) {
		if (existsSync(join(workspaceRoot, "package.json"))) return workspaceRoot;
		workspaceRoot = dirname(workspaceRoot);
	}
	return startDir;
}

export function expandWorkspacePatterns(workspaceRoot: string, patterns: string[]): string[] {
	const paths = new Set<string>();
	for (const pattern of patterns) {
		for (const path of expandWorkspacePattern(workspaceRoot, pattern)) {
			paths.add(path);
		}
	}
	return [...paths];
}

function expandWorkspacePattern(workspaceRoot: string, pattern: string): string[] {
	const normalized = pattern.replace(/\\/g, "/");
	if (!normalized.includes("*")) return [normalized];

	const parts = normalized.split("/");
	const starIndex = parts.findIndex((part) => part === "*");
	if (starIndex === -1) return [normalized];

	const baseParts = parts.slice(0, starIndex);
	const suffixParts = parts.slice(starIndex + 1);
	const baseDir = join(workspaceRoot, ...baseParts);
	if (!existsSync(baseDir)) return [];

	return readdirSync(baseDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const childPattern = [...baseParts, entry.name, ...suffixParts].join("/");
			return expandWorkspacePattern(workspaceRoot, childPattern);
		});
}

export function discoverWorkspacePackagesSync(workspaceRoot: string): WorkspacePackageEntry[] {
	const rootPackageJsonPath = join(workspaceRoot, "package.json");
	if (!existsSync(rootPackageJsonPath)) return [];

	const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf-8")) as PackageJson;
	const patterns = parseWorkspacePatterns(rootPackageJson.workspaces);
	if (patterns.length === 0) return [];

	const entries: WorkspacePackageEntry[] = [];
	for (const relativePath of expandWorkspacePatterns(workspaceRoot, patterns)) {
		const packageJsonPath = join(workspaceRoot, relativePath, "package.json");
		if (!existsSync(packageJsonPath)) continue;

		try {
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
			if (packageJson.name) {
				entries.push({ relativePath, name: packageJson.name });
			}
		} catch {
			// skip invalid package.json
		}
	}

	return entries;
}

export function discoverWorkspacePackageNamesSync(workspaceRoot: string): string[] {
	return discoverWorkspacePackagesSync(workspaceRoot).map((entry) => entry.name);
}

export function packageNameFromAbsolutePath(
	absolutePath: string,
	workspaceRoot: string,
	workspacePackages: readonly WorkspacePackageEntry[],
): string | null {
	const normalizedPath = absolutePath.replace(/\\/g, "/");
	const normalizedRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");

	if (!normalizedPath.startsWith(normalizedRoot)) return null;

	const relativePath = normalizedPath.slice(normalizedRoot.length).replace(/^\//, "");
	const sortedEntries = [...workspacePackages].sort(
		(a, b) => b.relativePath.length - a.relativePath.length,
	);

	for (const entry of sortedEntries) {
		if (relativePath === entry.relativePath || relativePath.startsWith(`${entry.relativePath}/`)) {
			return entry.name;
		}
	}

	return null;
}

export async function discoverWorkspacePackagesAsync(
	workspaceRoot: string,
	readDirectory: (dirPath: string) => Promise<string[]>,
	canAccessFile: (filePath: string) => Promise<boolean>,
	readFileAsText: (filePath: string) => Promise<string>,
	rootPackageJson: PackageJson,
): Promise<WorkspacePackageEntry[]> {
	const patterns = parseWorkspacePatterns(rootPackageJson.workspaces);
	if (patterns.length === 0) return [];

	const entries: WorkspacePackageEntry[] = [];
	for (const relativePath of await expandWorkspacePatternsAsync(
		workspaceRoot,
		patterns,
		readDirectory,
	)) {
		const packageJsonPath = join(workspaceRoot, relativePath, "package.json");
		try {
			const exists = await canAccessFile(packageJsonPath);
			if (!exists) continue;

			const content = await readFileAsText(packageJsonPath);
			const packageJson = JSON.parse(content) as PackageJson;
			if (packageJson.name) {
				entries.push({ relativePath, name: packageJson.name });
			}
		} catch {
			// skip invalid package.json
		}
	}

	return entries;
}

export async function discoverWorkspacePackageNamesAsync(
	workspaceRoot: string,
	readDirectory: (dirPath: string) => Promise<string[]>,
	canAccessFile: (filePath: string) => Promise<boolean>,
	readFileAsText: (filePath: string) => Promise<string>,
	rootPackageJson: PackageJson,
): Promise<string[]> {
	const entries = await discoverWorkspacePackagesAsync(
		workspaceRoot,
		readDirectory,
		canAccessFile,
		readFileAsText,
		rootPackageJson,
	);
	return entries.map((entry) => entry.name);
}

async function expandWorkspacePatternsAsync(
	workspaceRoot: string,
	patterns: string[],
	readDirectory: (dirPath: string) => Promise<string[]>,
): Promise<string[]> {
	const paths = new Set<string>();
	for (const pattern of patterns) {
		for (const path of await expandWorkspacePatternAsync(workspaceRoot, pattern, readDirectory)) {
			paths.add(path);
		}
	}
	return [...paths];
}

async function expandWorkspacePatternAsync(
	workspaceRoot: string,
	pattern: string,
	readDirectory: (dirPath: string) => Promise<string[]>,
): Promise<string[]> {
	const normalized = pattern.replace(/\\/g, "/");
	if (!normalized.includes("*")) return [normalized];

	const parts = normalized.split("/");
	const starIndex = parts.findIndex((part) => part === "*");
	if (starIndex === -1) return [normalized];

	const baseParts = parts.slice(0, starIndex);
	const suffixParts = parts.slice(starIndex + 1);
	const baseDir = join(workspaceRoot, ...baseParts);

	let entries: string[] = [];
	try {
		entries = await readDirectory(baseDir);
	} catch {
		return [];
	}

	const results: string[] = [];
	for (const entry of entries) {
		const childPattern = [...baseParts, entry, ...suffixParts].join("/");
		const expanded = await expandWorkspacePatternAsync(workspaceRoot, childPattern, readDirectory);
		results.push(...expanded);
	}
	return results;
}
