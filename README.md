# InterShell — monorepo entities

> **Typed building blocks for commits, packages, versioning, tags, and CI-friendly workflows — Bun-first, TypeScript-first.**

InterShell is a **library of entities**: small, focused modules you import from your own scripts, CLIs, or CI jobs. Each entity wraps a slice of monorepo work (git, Turbo, `package.json`, changelogs, compose, and more) behind a consistent API.

## Table of contents

- [Overview](#overview)
- [Install](#install)
- [Quick start](#quick-start)
- [Entities](#entities)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Development](#development)
- [Requirements](#requirements)
- [License](#license)

## Overview

- **Entity-first** — `EntityCommit`, `EntityPackage`, `EntityAffected`, and the rest are the product; compose them in your tooling.
- **Type-safe** — strict TypeScript, explicit types exported from each module.
- **Bun-oriented** — developed and tested on Bun; entities use Bun where it helps (for example shell helpers).

## Install

```bash
bun add intershell
```

```bash
npm install intershell
```

## Quick start

```typescript
import { EntityCommit, EntityPackage, EntityAffected } from "intershell";

const { stagedFiles } = await EntityCommit.getStagedFiles();
const errors = await EntityCommit.validateStagedFiles(stagedFiles);

const packages = await EntityPackage.getAllPackages();
const affected = await EntityAffected.getAffectedPackages();
```

Import names follow the `Entity*` convention (for example `EntityTag`, `EntityCompose`).

## Entities

| Entity | Role |
|--------|------|
| **EntityAffected** | Resolve affected packages via Turbo filters |
| **EntityBranch** | Branch data and validation helpers |
| **EntityCommit** | Conventional commits, parsing, staged-file checks |
| **EntityCompose** | Docker Compose parsing and validation-style operations |
| **EntityIntershellConfig** | Load and validate `intershell.config.json` |
| **EntityPackage** | Discover packages, read `package.json`, repo metadata |
| **EntityPackageChangelog** | Changelog content and templates |
| **EntityPackageCommits** | Commit ranges and dependency-aware analysis |
| **EntityPackageTags** | Tag naming and package-specific tag logic |
| **EntityPackageVersion** | Bump types and version data from history |
| **EntityTag** | Tags, prefixes, and git-related tag helpers |

See [Developer guide: entities](./docs/1_ENTITIES.md) for a slightly longer tour and patterns.

## Configuration

Optional project config lives at the repo root as `intershell.config.json`. Use **EntityIntershellConfig** to read and validate it from your own code.

```json
{
  "branch": {
    "prefixes": ["feat", "fix", "chore"],
    "minLength": 3,
    "maxLength": 50
  },
  "commit": {
    "types": ["feat", "fix", "docs", "style", "refactor", "test", "chore"],
    "scopes": ["package-name"]
  }
}
```

## Architecture

```text
┌─────────────────────────────────────┐
│  Your scripts / CLI / CI            │
├─────────────────────────────────────┤
│  intershell (barrel)                │
│  Entity* modules + shared helpers   │
└─────────────────────────────────────┘
```

The package entry re-exports entity modules from the root import (`intershell`).

## Development

When working on this repository:

```bash
bun run lint         # Biome (report only)
bun run typecheck    # TypeScript
bun test
bun run build
bun run check   # lint --fix, then typecheck, test, and build
```

Release to npm after `version:prepare` and `version:apply` (so `package.json` and the git tag match):

```bash
bun run version:publish              # validate, build, npm publish
bun run version:publish -- --dry-run # npm publish --dry-run
```

The script lives at `scripts/version/publish.ts` and is exposed as `version:publish` so it stays grouped with the other version scripts and does not use the script name `publish` (npm treats that as a lifecycle hook after `npm publish`).

## Requirements

- **Bun** >= 1.0.0 (recommended runtime)
- **Turbo** >= 2.5.8 (peer dependency — required for **EntityAffected** and similar flows)

When you develop **inside** this repository, you also use TypeScript, Biome, and Lefthook as listed in `package.json`; consumers only need what their chosen entities call (often Turbo for monorepo graphs).

## License

MIT — see [LICENSE](LICENSE).
