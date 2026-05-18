import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { entitiesShell } from "../entities.shell";
import {
	discoverWorkspacePackagesAsync,
	EntityPackage,
	packageNameFromAbsolutePath,
	type TsConfig,
	type TsConfigPaths,
	type WorkspacePackageEntry,
} from "../package";
import { packagesShell } from "../package/package.shell";

export class EntityDependencyAnalyzer {
	private readonly package: EntityPackage;

	constructor(packageInstance: EntityPackage) {
		this.package = packageInstance;
	}

	/**
	 * Get internal monorepo dependencies for a package at a specific tag/commit
	 * Returns only dependencies within this monorepo
	 */
	async getPackageDependenciesAtRef(reference: string): Promise<string[]> {
		try {
			const allPackages = await EntityPackage.getAllPackages();
			const internalPackages = new Set(allPackages);
			const workspaceContext = await this.getWorkspaceContext();

			const packageJsonDeps = await this.getPackageJsonDependencies(reference, internalPackages);
			const tsconfigDeps = await this.getTsConfigDependencies(
				reference,
				internalPackages,
				workspaceContext,
			);

			const allDeps = [...new Set([...packageJsonDeps, ...tsconfigDeps])];
			return allDeps.filter((dep) => internalPackages.has(dep));
		} catch {
			return [];
		}
	}

	private async getWorkspaceContext(): Promise<{
		readonly workspaceRoot: string;
		readonly workspacePackages: WorkspacePackageEntry[];
	}> {
		const workspaceRoot = await packagesShell.getWorkspaceRoot();
		const rootPackageJson = packagesShell.readJsonFile(`${workspaceRoot}/package.json`);
		const workspacePackages = await discoverWorkspacePackagesAsync(
			workspaceRoot,
			packagesShell.readDirectory,
			packagesShell.canAccessFile,
			packagesShell.readFileAsText,
			rootPackageJson,
		);

		return { workspaceRoot, workspacePackages };
	}

	/**
	 * Get package.json dependencies for a package at a specific reference
	 */
	private async getPackageJsonDependencies(
		reference: string,
		internalPackages: ReadonlySet<string>,
	): Promise<string[]> {
		try {
			const result = await entitiesShell.gitShowPackageJsonAtTag(
				reference,
				this.package.getJsonPath(),
			);

			if (result.exitCode !== 0) {
				return [];
			}

			const packageJson = JSON.parse(result.text()) as Record<string, unknown>;
			const deps = [
				...(packageJson.dependencies
					? Object.keys(packageJson.dependencies as Record<string, string>)
					: []),
				...(packageJson.devDependencies
					? Object.keys(packageJson.devDependencies as Record<string, string>)
					: []),
				...(packageJson.peerDependencies
					? Object.keys(packageJson.peerDependencies as Record<string, string>)
					: []),
			];

			return deps.filter((dep) => internalPackages.has(dep));
		} catch {
			return [];
		}
	}

	/**
	 * Get tsconfig dependencies by resolving paths to actual internal packages
	 */
	private async getTsConfigDependencies(
		reference: string,
		internalPackages: ReadonlySet<string>,
		workspaceContext: {
			readonly workspaceRoot: string;
			readonly workspacePackages: WorkspacePackageEntry[];
		},
	): Promise<string[]> {
		try {
			const packagePath = this.package.getPath();
			const tsconfigPaths = await this.getTsConfigPaths(reference);

			const deps: string[] = [];

			for (const [alias, paths] of Object.entries(tsconfigPaths)) {
				if (internalPackages.has(alias)) {
					deps.push(alias);
				}

				if (Array.isArray(paths)) {
					for (const path of paths) {
						const resolvedPath = resolve(packagePath, path);
						const internalPackage = this.findInternalPackageFromPath(
							resolvedPath,
							workspaceContext.workspaceRoot,
							workspaceContext.workspacePackages,
						);
						if (internalPackage) {
							deps.push(internalPackage);
						}
					}
				}
			}

			return [...new Set(deps)];
		} catch {
			return [];
		}
	}

	private findInternalPackageFromPath(
		absolutePath: string,
		workspaceRoot: string,
		workspacePackages: readonly WorkspacePackageEntry[],
	): string | null {
		return packageNameFromAbsolutePath(absolutePath, workspaceRoot, workspacePackages);
	}

	/**
	 * Get TypeScript configuration paths for a package at a specific git reference
	 */
	private async getTsConfigPaths(reference: string): Promise<TsConfigPaths> {
		try {
			const tsconfig = await this.readTsconfigAtRef(reference);
			const resolvedConfig = await this.resolveExtendedTsConfig(tsconfig, this.package.getPath());

			return resolvedConfig.compilerOptions?.paths || {};
		} catch {
			return {};
		}
	}

	/**
	 * Read tsconfig.json at a specific git reference
	 */
	private async readTsconfigAtRef(reference: string): Promise<TsConfig> {
		try {
			const result = await entitiesShell.gitShow(`${reference}:${this.package.getTsconfigPath()}`);
			if (result.exitCode !== 0) {
				return {};
			}

			const content = result.text();
			return JSON.parse(content);
		} catch {
			return {};
		}
	}

	/**
	 * Resolve extended TypeScript configurations
	 */
	private async resolveExtendedTsConfig(config: TsConfig, packagePath: string): Promise<TsConfig> {
		if (!config.extends) {
			return config;
		}

		const extendedPath = resolve(packagePath, config.extends);
		if (!existsSync(extendedPath)) {
			return config;
		}

		try {
			const extendedContent = readFileSync(extendedPath, "utf-8");
			const extendedConfig: TsConfig = JSON.parse(extendedContent);

			const resolvedExtended = await this.resolveExtendedTsConfig(extendedConfig, packagePath);

			return {
				...resolvedExtended,
				...config,
				compilerOptions: {
					...resolvedExtended.compilerOptions,
					...config.compilerOptions,
					paths: {
						...(resolvedExtended.compilerOptions?.paths || {}),
						...(config.compilerOptions?.paths || {}),
					},
				},
			};
		} catch {
			return config;
		}
	}
}
