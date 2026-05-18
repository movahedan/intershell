import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	discoverWorkspacePackageNamesSync,
	findWorkspaceRootSync,
} from "../package/workspace-discovery";
import { defaultConfig } from "./intershell-config.default";
import type { CustomConfigJson, IConfig } from "./intershell-config.types";

class Config {
	private config: IConfig;

	constructor(customConfig?: CustomConfigJson) {
		if (customConfig) {
			this.config = this.mergeConfig(customConfig);
		} else {
			this.config = this.mergeConfig({});
		}
	}

	getConfig(): IConfig {
		return this.config;
	}

	private mergeConfig(config: CustomConfigJson): IConfig {
		// Load packages for commit scopes if not provided and not explicitly null
		let commitScopes: string[] = [];
		if (config.commit?.conventional?.scopes?.list === undefined) {
			try {
				// This is a synchronous operation that reads from the filesystem
				// We'll populate it with available packages
				commitScopes = this.getAvailablePackages();
			} catch {
				commitScopes = [];
			}
		}

		return {
			...defaultConfig,
			commit: {
				...defaultConfig.commit,
				...config.commit,
				conventional: {
					...defaultConfig.commit.conventional,
					...config.commit?.conventional,
					type: {
						...defaultConfig.commit.conventional.type,
						...config.commit?.conventional?.type,
						// Preserve null if explicitly set
						list:
							config.commit?.conventional?.type?.list !== undefined
								? config.commit.conventional.type.list
								: defaultConfig.commit.conventional.type.list,
					},
					scopes: {
						...defaultConfig.commit.conventional.scopes,
						...config.commit?.conventional?.scopes,
						// Preserve null if explicitly set, otherwise use default or computed scopes
						list:
							config.commit?.conventional?.scopes?.list !== undefined
								? config.commit.conventional.scopes.list
								: commitScopes,
					},
					description: {
						...defaultConfig.commit.conventional.description,
						...config.commit?.conventional?.description,
					},
					bodyLines: {
						...defaultConfig.commit.conventional.bodyLines,
						...config.commit?.conventional?.bodyLines,
					},
				},
				staged: config.commit?.staged || defaultConfig.commit.staged,
			} as IConfig["commit"],
			branch: {
				...defaultConfig.branch,
				...config.branch,
				// Preserve null if explicitly set
				prefixes:
					config.branch?.prefixes !== undefined
						? config.branch.prefixes
						: defaultConfig.branch.prefixes,
			} as IConfig["branch"],
			package: {
				...defaultConfig.package,
				...config.package,
			} as IConfig["package"],
			tag: {
				...defaultConfig.tag,
				...config.tag,
				name: {
					...defaultConfig.tag.name,
					...config.tag?.name,
				},
			} as IConfig["tag"],
		};
	}

	private getAvailablePackages(): string[] {
		const packages: string[] = ["root"];

		try {
			const workspaceRoot = findWorkspaceRootSync();
			packages.push(...discoverWorkspacePackageNamesSync(workspaceRoot));
		} catch {
			// If we can't read workspaces, fall back to root only
		}

		return packages;
	}
}

function getCustomConfig(): CustomConfigJson | undefined {
	let customConfig: CustomConfigJson | undefined;
	try {
		// Read root package.json directly
		const rootPackageJsonPath = join(process.cwd(), "package.json");
		const rootPackageJsonContent = readFileSync(rootPackageJsonPath, "utf-8");
		const rootPackageJson = JSON.parse(rootPackageJsonContent);

		const configFilePath = rootPackageJson.intershell?.config;
		if (!configFilePath) throw new Error();

		const config = readFileSync(configFilePath, "utf-8");
		customConfig = JSON.parse(config) as CustomConfigJson;
	} catch {
		customConfig = undefined;
	}
	return customConfig;
}

// Lazy initialization to allow mocking in tests
let _entitiesConfig: Config | undefined;

function getEntitiesConfig(): Config {
	if (!_entitiesConfig) {
		_entitiesConfig = new Config(getCustomConfig());
	}
	return _entitiesConfig;
}

export const entitiesConfig = getEntitiesConfig();
