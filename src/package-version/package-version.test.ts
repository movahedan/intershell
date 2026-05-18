import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ParsedCommitData } from "../commit";
import { EntityPackage } from "../package";
import { installPackagesShellTestMock } from "../package/package-test-mock";
import { EntityPackageCommits } from "../package-commits";
import { EntityPackageTags } from "../package-tags";
import { EntityPackageVersion } from "./package-version";

let restorePackagesShellMock: () => void;
let originalGetLatestPackageVersionInHistory: typeof EntityPackageTags.prototype.getLatestPackageVersionInHistory;

function createEntityPackageVersion(packageName: string): EntityPackageVersion {
	const packageInstance = new EntityPackage(packageName);
	const commitPackage = new EntityPackageCommits(packageInstance);
	const tagPackage = new EntityPackageTags(packageInstance);
	return new EntityPackageVersion(packageInstance, commitPackage, tagPackage);
}

describe("EntityPackageVersion", () => {
	beforeEach(() => {
		restorePackagesShellMock = installPackagesShellTestMock();

		originalGetLatestPackageVersionInHistory =
			EntityPackageTags.prototype.getLatestPackageVersionInHistory;
		EntityPackageTags.prototype.getLatestPackageVersionInHistory = mock(function (
			this: EntityPackageTags,
		) {
			const packageName = (this as unknown as { package: EntityPackage }).package.getName();
			if (packageName === "root") return Promise.resolve("1.0.0");
			return Promise.resolve("0.1.0");
		});
	});

	afterEach(() => {
		restorePackagesShellMock();
		EntityPackageTags.prototype.getLatestPackageVersionInHistory =
			originalGetLatestPackageVersionInHistory;
	});

	test("should create instance", () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");
		expect(entityPackageVersion).toBeDefined();
	});

	test("should create root instance", () => {
		const entityPackageVersion = createEntityPackageVersion("root");
		expect(entityPackageVersion).toBeDefined();
	});

	test("should calculate bump type for regular package", async () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");

		const commits: ParsedCommitData[] = [
			{
				message: { type: "feat", description: "add new feature", isBreaking: false },
				files: ["src/feature.ts"],
			} as ParsedCommitData,
		];

		const versionData = await entityPackageVersion.calculateVersionData(commits);
		expect(versionData.bumpType).toBe("minor");
	});

	test("should calculate bump type for breaking changes", async () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");

		const commits: ParsedCommitData[] = [
			{
				message: { type: "feat", description: "add new feature", isBreaking: true },
				files: ["src/feature.ts"],
			} as ParsedCommitData,
		];

		const versionData = await entityPackageVersion.calculateVersionData(commits);
		expect(versionData.bumpType).toBe("major");
	});

	test("should calculate bump type for patch changes", async () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");

		const commits: ParsedCommitData[] = [
			{
				message: { type: "fix", description: "fix bug", isBreaking: false },
				files: ["src/bug.ts"],
			} as ParsedCommitData,
		];

		const versionData = await entityPackageVersion.calculateVersionData(commits);
		expect(versionData.bumpType).toBe("patch");
	});

	test("should return none for empty commits", async () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");
		const versionData = await entityPackageVersion.calculateVersionData([]);
		expect(versionData.bumpType).toBe("none");
	});

	test("should calculate version data for first version", async () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");

		const versionData = await entityPackageVersion.calculateVersionData([]);

		expect(versionData.shouldBump).toBe(false);
		expect(versionData.targetVersion).toBe("0.1.0");
		expect(versionData.bumpType).toBe("none");
		expect(versionData.reason).toBe("No commits in range");
	});

	test("should not bump when no commits", async () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");

		const versionData = await entityPackageVersion.calculateVersionData([]);

		expect(versionData.shouldBump).toBe(false);
		expect(versionData.targetVersion).toBe("0.1.0");
		expect(versionData.bumpType).toBe("none");
		expect(versionData.reason).toBe("No commits in range");
	});

	test("should calculate bump type for root package", async () => {
		const entityPackageVersion = createEntityPackageVersion("root");

		const commits: ParsedCommitData[] = [
			{
				message: { type: "feat", description: "add feature", isBreaking: false, scopes: ["root"] },
				files: ["package.json"],
			} as ParsedCommitData,
		];

		const versionData = await entityPackageVersion.calculateVersionData(commits);
		expect(versionData.bumpType).toBe("minor");
	});

	test("should use override bump type when provided", async () => {
		const entityPackageVersion = createEntityPackageVersion("@apps/api");

		const commits: ParsedCommitData[] = [
			{
				message: { type: "feat", description: "add new feature", isBreaking: false },
				files: ["src/feature.ts"],
			} as ParsedCommitData,
		];

		const versionDataMajor = await entityPackageVersion.calculateVersionData(commits, "major");
		expect(versionDataMajor.bumpType).toBe("major");

		const versionDataPatch = await entityPackageVersion.calculateVersionData(commits, "patch");
		expect(versionDataPatch.bumpType).toBe("patch");

		const versionDataNone = await entityPackageVersion.calculateVersionData(commits, "none");
		expect(versionDataNone.bumpType).toBe("none");
		expect(versionDataNone.shouldBump).toBe(false);
	});
});
