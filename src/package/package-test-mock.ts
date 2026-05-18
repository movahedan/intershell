import { mock } from "bun:test";
import { packagesShell } from "./package.shell";
import type { PackageJson } from "./package.types";

const defaultRootPackageJson = (): PackageJson => ({
	name: "root",
	version: "1.0.0",
	private: false,
});

const defaultAppsApiPackageJson = (): PackageJson => ({
	name: "@apps/api",
	version: "0.1.0",
	private: false,
});

export function installPackagesShellTestMock(): () => void {
	const originalReadJsonFile = packagesShell.readJsonFile;

	packagesShell.readJsonFile = mock((filePath: string) => {
		if (filePath === "./package.json") {
			return defaultRootPackageJson();
		}
		if (filePath === "apps/api/package.json") {
			return defaultAppsApiPackageJson();
		}
		throw new Error(`Unexpected package.json path: ${filePath}`);
	});

	return () => {
		packagesShell.readJsonFile = originalReadJsonFile;
	};
}
