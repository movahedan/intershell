import { entitiesShell } from "../entities.shell";
import { entitiesConfig } from "../intershell-config/intershell-config";
import { packagesShell } from "./package.shell";
import type { PackageJson, TsConfig } from "./package.types";
import {
	discoverWorkspacePackageNamesAsync,
	discoverWorkspacePackagesSync,
	findWorkspaceRootSync,
	getWorkspacePackagePath,
} from "./workspace-discovery";

export class EntityPackage {
	private readonly packageName: string;
	private packageJson: PackageJson | undefined;
	constructor(packageName: string) {
		this.packageName = packageName;
		this.packageJson = this.readJson();
	}

	getName(): string {
		return this.packageName;
	}
	isRoot(): boolean {
		return this.getName() === "root";
	}

	getPath(): string {
		if (this.packageName === "root") return ".";
		const workspacePath = getWorkspacePackagePath(this.packageName);
		if (workspacePath !== null) return workspacePath;

		const workspaceRoot = findWorkspaceRootSync();
		const entry = discoverWorkspacePackagesSync(workspaceRoot).find(
			(pkg) => pkg.name === this.packageName,
		);
		if (entry) return entry.relativePath;

		return this.packageName;
	}

	getJsonPath(): string {
		return `${this.getPath()}/package.json`;
	}
	readJson(): PackageJson {
		if (this.packageJson) {
			return this.packageJson;
		}

		const jsonPath = this.getJsonPath();
		try {
			const packageJson = packagesShell.readJsonFile(jsonPath);
			return packageJson;
		} catch (error) {
			throw new Error(`Package not found ${this.packageName} at ${this.getJsonPath()}: ${error}`);
		}
	}
	async writeJson(data: PackageJson): Promise<void> {
		await packagesShell.writeJsonFile(this.getJsonPath(), data);
		this.packageJson = data;
		await entitiesShell.runBiomeCheck(this.getJsonPath());
	}

	readVersion(): string | undefined {
		return this.readJson().version;
	}
	async writeVersion(version: string): Promise<void> {
		const packageJson = this.readJson();
		packageJson.version = version;
		this.packageJson = packageJson;
		await this.writeJson(packageJson);
	}

	getTsconfigPath(): string {
		return `${this.getPath()}/tsconfig.json`;
	}
	readTsconfig(): TsConfig {
		const tsconfigPath = this.getTsconfigPath();
		const content = packagesShell.readFileAsTextSync(tsconfigPath);
		return JSON.parse(content);
	}
	async writeTsconfig(content: string): Promise<void> {
		const tsconfigPath = this.getTsconfigPath();
		await packagesShell.writeFileAsText(tsconfigPath, content);
		await entitiesShell.runBiomeCheck(tsconfigPath);
	}

	getChangelogPath(): string {
		return `${this.getPath()}/CHANGELOG.md`;
	}
	readChangelog(): string {
		const changelogPath = this.getChangelogPath();
		return packagesShell.readChangelogFile(changelogPath);
	}
	async writeChangelog(content: string): Promise<void> {
		await packagesShell.writeChangelogFile(this.getChangelogPath(), content);
		await entitiesShell.runBiomeCheck(this.getChangelogPath());
	}

	validatePackage(): string[] {
		const packageJson = this.readJson();
		const config = entitiesConfig.getConfig();
		const errors: string[] = [];

		// Only validate if package validation is enabled
		if (!config.package) {
			return errors;
		}

		const rules = config.package;

		// Selective versioning rules
		if (rules.selectiveVersioning.enabled) {
			if (packageJson.private === true && packageJson.version) {
				errors.push(`${this.packageName}: Private packages should not have version field`);
			}
			if (packageJson.private !== true && !packageJson.version) {
				errors.push(`${this.packageName}: Versioned packages must have a version field`);
			}
			if (!packageJson.version && packageJson.private !== true) {
				errors.push(`${this.packageName}: Unversioned packages must have private: true`);
			}
			if (packageJson.version && packageJson.private === true) {
				errors.push(`${this.packageName}: Versioned packages should not have private: true`);
			}
		}

		// Semantic versioning rules
		if (rules.semanticVersioning.enabled && packageJson.version) {
			if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
				errors.push(`${this.packageName}: Version should follow semantic versioning (e.g., 1.0.0)`);
			}
		}

		// Description rules
		if (rules.description.enabled && packageJson.version && !packageJson.description) {
			errors.push(`${this.packageName}: Consider adding a description to package.json`);
		}

		return errors;
	}

	/**
	 * Determines if this package should be versioned based on its private field
	 * @returns true if the package should be versioned (private !== true)
	 */
	shouldVersion(): boolean {
		const packageJson = this.readJson();
		// Package should be versioned if private is false or undefined
		return packageJson.private !== true;
	}

	/**
	 * Gets the tag series name for this package
	 * @returns tag series prefix (e.g., 'v', 'packages/intershell-v') or null if package shouldn't be versioned
	 */
	getTagSeriesName(): string | null {
		if (!this.shouldVersion()) return null;

		if (this.packageName === "root") return "v";
		return `${this.packageName.replaceAll("@", "")}-v`;
	}

	static getRepoUrl(): string {
		const rootPackageJson = new EntityPackage("root").readJson();
		return typeof rootPackageJson.repository === "string"
			? rootPackageJson.repository
			: rootPackageJson.repository?.url || "";
	}
	static async getAllPackages(): Promise<string[]> {
		const packages: string[] = ["root"];
		const workspaceRoot = await packagesShell.getWorkspaceRoot();
		const rootPackageJson = packagesShell.readJsonFile(`${workspaceRoot}/package.json`);

		const workspacePackages = await discoverWorkspacePackageNamesAsync(
			workspaceRoot,
			packagesShell.readDirectory,
			packagesShell.canAccessFile,
			packagesShell.readFileAsText,
			rootPackageJson,
		);

		packages.push(...workspacePackages);
		return packages;
	}

	/**
	 * Gets all packages that should be versioned (private !== true)
	 * @returns Array of package names that should be versioned
	 */
	static async getVersionedPackages(): Promise<string[]> {
		const allPackages = await EntityPackage.getAllPackages();
		const versionedPackages: string[] = [];

		for (const packageName of allPackages) {
			const packageInstance = new EntityPackage(packageName);
			if (packageInstance.shouldVersion()) {
				versionedPackages.push(packageName);
			}
		}

		return versionedPackages;
	}

	/**
	 * Gets all packages that should NOT be versioned (private === true)
	 * @returns Array of package names that should NOT be versioned
	 */
	static async getUnversionedPackages(): Promise<string[]> {
		const allPackages = await EntityPackage.getAllPackages();
		const unversionedPackages: string[] = [];

		for (const packageName of allPackages) {
			const packageInstance = new EntityPackage(packageName);
			if (!packageInstance.shouldVersion()) {
				unversionedPackages.push(packageName);
			}
		}

		return unversionedPackages;
	}

	/**
	 * Validates all packages in the workspace
	 * @returns Object containing validation results for all packages
	 */
	static async validateAllPackages(): Promise<string[]> {
		const allPackages = await EntityPackage.getAllPackages();
		const errors: Array<string> = [];

		for (const packageName of allPackages) {
			const packageInstance = new EntityPackage(packageName);
			const packageErrors = packageInstance.validatePackage();

			errors.push(...packageErrors);
		}

		return errors;
	}
}
