import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EntityPackage } from "../package";
import { installPackagesShellTestMock } from "../package/package-test-mock";
import { EntityPackageCommits } from "./package-commits";

describe("EntityPackageCommits", () => {
	let restorePackagesShellMock: () => void;

	beforeEach(() => {
		restorePackagesShellMock = installPackagesShellTestMock();
	});

	afterEach(() => {
		restorePackagesShellMock();
	});

	test("should create instance", () => {
		const packageInstance = new EntityPackage("@apps/api");
		const commitPackage = new EntityPackageCommits(packageInstance);
		expect(commitPackage).toBeDefined();
	});

	test("should create root instance", () => {
		const packageInstance = new EntityPackage("root");
		const rootCommitPackage = new EntityPackageCommits(packageInstance);
		expect(rootCommitPackage).toBeDefined();
	});

	test("should have main method", () => {
		const packageInstance = new EntityPackage("@apps/api");
		const commitPackage = new EntityPackageCommits(packageInstance);
		expect(typeof commitPackage.getCommitsInRange).toBe("function");
	});

	describe("getCommitsInRange", () => {
		test("should return empty array when git operations fail", async () => {
			const packageInstance = new EntityPackage("root");
			const commitPackage = new EntityPackageCommits(packageInstance);
			const result = await commitPackage.getCommitsInRange("invalid", "invalid");
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(0);
		});

		test("should handle package-specific commits", async () => {
			const packageInstance = new EntityPackage("@apps/api");
			const commitPackage = new EntityPackageCommits(packageInstance);
			const result = await commitPackage.getCommitsInRange("invalid", "invalid");
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(0);
		});
	});
});
