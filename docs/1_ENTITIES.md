# 📦 InterShell entities

> How the entity layer fits together and how to use it from your own tooling.

## Table of contents

- [Overview](#-overview)
- [How to import](#-how-to-import)
- [Entity catalog](#-entity-catalog)
- [Testing and mocking](#-testing-and-mocking)
- [Related docs](#-related-docs)
- [Repository hooks](#-repository-hooks)

## Overview

InterShell is built around **entities**: plain TypeScript modules that expose a single `Entity*` object (or named exports) for one concern. They are meant to be imported from applications, internal CLIs, or CI scripts — not tied to a single shipped CLI.

Together they cover most monorepo automation touchpoints: **git**, **tags**, **conventional commits**, **packages**, **changelogs**, **Turbo affected graphs**, and **Docker Compose**.

## How to import

Use the package root so you always get the supported public surface:

```typescript
import {
  EntityAffected,
  EntityCommit,
  EntityPackage,
  EntityTag,
} from "intershell";
```

Individual entities live under `src/<name>/`; the root `src/index.ts` file re-exports them.

## Entity catalog

- **EntityAffected** — Given a base SHA (or tag-derived SHA), asks Turbo which packages fall in the affected graph.
- **EntityBranch** — Branch naming and validation aligned with your config.
- **EntityCommit** — Parse and validate conventional commits, inspect staged files, and related PR utilities where exposed.
- **EntityCompose** — Work with Compose documents and derived structures used in dev/CI.
- **EntityIntershellConfig** — Typed access to `intershell.config.json`.
- **EntityPackage** — Enumerate workspace packages and inspect `package.json` metadata.
- **EntityPackageChangelog** — Build or transform changelog-oriented data.
- **EntityPackageCommits** — Analyze commit lists with dependency awareness between packages.
- **EntityPackageTags** — Tag naming schemes and package-scoped tag rules.
- **EntityPackageVersion** — Infer bump levels and next versions from history and config.
- **EntityTag** — List, resolve, and reason about git tags (including helpers used by versioning and affected flows).

Exact method names and return types are defined in each module’s `.ts` files and `.d.ts` outputs under `dist/` after `bun run build`.

## Testing and mocking

Entities that touch git or Turbo delegate to **`entitiesShell`** (`src/entities.shell.ts`). In unit tests, mock or replace those calls so tests do not require a full git history or Turbo install.

## Related docs

- [README](../README.md) — install, quick start, high-level architecture
- [CLAUDE.md](../CLAUDE.md) — maintainer-oriented layout and conventions

## Repository hooks

This repo’s **lefthook** configuration calls `bun run commit:check`, implemented as `src/commit-check.ts`. Pre-push also runs `bun run lint` (see `package.json`). These are for **maintainers of InterShell**; they are **not** exported from the package entry and are not part of the published API.
