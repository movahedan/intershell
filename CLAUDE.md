# CLAUDE.md

Guidance for working in the **InterShell** repository: a **Bun-first TypeScript library of monorepo entities**.

## Package overview

InterShell’s main value is the **entity layer**: typed helpers for commits, packages, versioning, tags, Docker Compose, affected-package detection, and config. Consumers import from the package root (`intershell`).

## Essential commands

- `bun run build` — compile to `dist/`
- `bun run typecheck` — `tsc --noEmit`
- `bun test` — Bun test runner
- `bun run lint` — Biome (report only)
- `bun run check` — `lint --fix`, then typecheck, test, and build
- `bun run version:publish` — build and `npm publish` the **current** `package.json` version (`scripts/version/publish.ts`; not named `publish` to avoid the npm `publish` lifecycle hook; optional `--no-tag-check`). After a real publish, runs `gh release create` or `gh release edit` unless `--no-github`; create uses `--verify-tag` (tag must exist on the remote).

## Source layout

```text
src/
├── index.ts              # Public barrel: re-exports all entities
├── entities.shell.ts     # Shared shell/git/turbo helpers for entities
├── affected/
├── branch/
├── commit/
├── compose/
├── intershell-config/
├── package/
├── package-changelog/
├── package-commits/
├── package-tags/
├── package-version/
├── tag/
└── commit-check.ts       # Repo-local lefthook helper (not exported from index)
```

There may be a parallel `src/entities/**` tree during refactors; the **published surface** is whatever `src/index.ts` exports.

## Entities (production focus)

Each `Entity*` groups one domain:

- **EntityAffected** — Turbo-based affected packages
- **EntityBranch** — Branch-related behavior
- **EntityCommit** — Parsing, validation, PR helpers, staged files
- **EntityCompose** — Compose files and service-oriented logic
- **EntityIntershellConfig** — Config file loading and validation
- **EntityPackage** — Package discovery and `package.json` utilities
- **EntityPackageChangelog** — Changelog generation helpers
- **EntityPackageCommits** — Commit analysis and dependency filtering
- **EntityPackageTags** — Tag conventions per package
- **EntityPackageVersion** — Version bumps from commit history
- **EntityTag** — Git tags and base SHAs

## Design notes

- Prefer **explicit return types** on public entity methods.
- **Mock `entitiesShell`** in tests when git/turbo/Biome calls must be isolated.
- Keep entities **self-contained**; share only via small internal modules (for example `entities.shell.ts`).

## Dependencies

- **Peer**: Turbo (for affected-package and related workflows)
- **Dev**: TypeScript, Biome, Bun types, Lefthook — see `package.json`

When changing behavior, update **README.md** and **docs/** if user-facing behavior or imports change.
