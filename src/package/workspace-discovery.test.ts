import { describe, expect, test } from "bun:test";
import {
	packageNameFromAbsolutePath,
	parseWorkspacePatterns,
	type WorkspacePackageEntry,
} from "./workspace-discovery";

describe("workspace-discovery", () => {
	test("parseWorkspacePatterns handles array format", () => {
		expect(parseWorkspacePatterns(["apps/*", "packages/*"])).toEqual(["apps/*", "packages/*"]);
	});

	test("parseWorkspacePatterns handles object format", () => {
		expect(parseWorkspacePatterns({ packages: ["tools/*"] })).toEqual(["tools/*"]);
	});

	test("parseWorkspacePatterns returns empty for missing workspaces", () => {
		expect(parseWorkspacePatterns(undefined)).toEqual([]);
	});

	test("packageNameFromAbsolutePath resolves workspace package from path", () => {
		const workspacePackages: WorkspacePackageEntry[] = [
			{ relativePath: "packages/ui", name: "@packages/ui" },
			{ relativePath: "apps/api", name: "@apps/api" },
		];

		expect(
			packageNameFromAbsolutePath(
				"/workspace/packages/ui/src/index.ts",
				"/workspace",
				workspacePackages,
			),
		).toBe("@packages/ui");

		expect(
			packageNameFromAbsolutePath(
				"/workspace/apps/api/Dockerfile",
				"/workspace",
				workspacePackages,
			),
		).toBe("@apps/api");
	});

	test("packageNameFromAbsolutePath returns null for paths outside workspace", () => {
		expect(
			packageNameFromAbsolutePath("/other/path", "/workspace", [
				{ relativePath: "packages/ui", name: "@packages/ui" },
			]),
		).toBeNull();
	});
});
