# 🚀 InterShell - CLI Toolkit for Developer Workflow Automation

> **Bun-first CLI toolkit for developer workflow automation in monorepos and monoliths**

InterShell is a modern, type-safe CLI toolkit built with Bun and TypeScript that automates common developer workflows in monorepos and monoliths. It provides commands for version management, commit validation, CI/CD integration, and development environment management.

## ✨ Features

- **📦 Version Management** - Automate semantic versioning with changelog generation
- **✅ Commit Validation** - Enforce conventional commit standards with branch validation
- **🔄 CI/CD Integration** - GitHub Actions integration for affected packages and service ports
- **🐳 Docker Compose Support** - Manage development environments and service health checks
- **📊 Package Management** - Analyze dependencies and affected packages in monorepos
- **🏷️ Git Operations** - Tag management, branch validation, and commit parsing
- **🔧 Type Safety** - Full TypeScript support with strict type checking
- **⚡ Bun-First** - Built for Bun runtime with zero Node.js dependencies

## 📦 Installation

```bash
# Using Bun
bun add -g intershell

# Using npm
npm install -g intershell
```

## 🚀 Quick Start

### Version Management

Prepare and apply version changes with automatic changelog generation:

```bash
# Prepare version bump (creates changelog, updates package.json)
intershell version:prepare

# Apply version changes (commits and tags)
intershell version:apply

# CI-friendly version preparation
intershell version:ci
```

### Commit Validation

Validate commits follow conventional commit standards:

```bash
# Check if commit message is valid
intershell commit-check

# Interactive commit with validation
intershell commit "feat(package): add new feature"
```

### CI/CD Integration

Integrate with GitHub Actions for affected package detection:

```bash
# Attach affected packages to GitHub Actions output
intershell ci:attach-affected -o affected-services -m turbo

# Attach Docker service ports for affected services
intershell ci:attach-service-ports -o service-ports

# Run GitHub Actions locally
intershell ci:act --event pull_request --workflow .github/workflows/Check.yml
```

### Development Environment

Manage development containers and services:

```bash
# Check DevContainer service health
intershell dev:check

# Setup development environment
intershell dev:setup

# Cleanup development resources
intershell dev:cleanup

# Remove development containers
intershell dev:rm
```

### Local Development

Manage local development setup:

```bash
# Setup local development environment
intershell local:setup

# Generate VS Code workspace configuration
intershell local:vscode

# Cleanup local development resources
intershell local:cleanup
```

## 📚 Available Commands

### Version Commands
- `version:prepare` - Prepare version bump with changelog generation
- `version:apply` - Apply version changes (commit and tag)
- `version:ci` - CI-friendly version preparation

### Commit Commands
- `commit` - Execute git commit with message
- `commit-check` - Validate commit message format

### CI Commands
- `ci:act` - Run GitHub Actions workflows locally
- `ci:attach-affected` - Attach affected packages to GitHub Actions output
- `ci:attach-service-ports` - Attach service ports for affected Docker services

### Dev Commands
- `dev:check` - Check DevContainer service health
- `dev:setup` - Setup development environment
- `dev:cleanup` - Cleanup development resources
- `dev:rm` - Remove development containers

### Local Commands
- `local:setup` - Setup local development environment
- `local:vscode` - Generate VS Code workspace configuration
- `local:cleanup` - Cleanup local development resources

## 🔧 Core Concepts

### Entity System

InterShell uses an entity-driven architecture for monorepo operations:

- **EntityAffected** - Detect affected packages for CI/CD optimization
- **EntityBranch** - Git branch validation and operations
- **EntityCommit** - Commit parsing and validation (Conventional Commits)
- **EntityCompose** - Docker Compose parsing and service management
- **EntityPackage** - Package management and operations
- **EntityPackageVersion** - Version calculation and management
- **EntityPackageChangelog** - Changelog generation
- **EntityTag** - Git tag operations and management

### Configuration

InterShell can be configured via `intershell.config.json` in your project root:

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

## 🏗️ Architecture

```
┌─────────────────────┐
│   CLI Commands      │
│  (oclif-based)      │
├─────────────────────┤
│   Entity System     │
│  (Business Logic)   │
├─────────────────────┤
│   Core Utilities    │
│  (colorify, etc)    │
└─────────────────────┘
```

### Key Principles

1. **Entity-Driven** - Business logic encapsulated in reusable entities
2. **Type-Safe** - Full TypeScript support with strict typing
3. **Bun-First** - Optimized for Bun runtime
4. **Monorepo-Aware** - Built for Turborepo and monorepo workflows
5. **CI/CD Ready** - GitHub Actions integration out of the box

## 📖 Usage Examples

### Version Bump Workflow

```bash
# 1. Prepare version (updates package.json and generates changelog)
intershell version:prepare

# 2. Review changes
git diff

# 3. Apply version (commits and creates tag)
intershell version:apply
```

### Conventional Commits

InterShell enforces Conventional Commits standard:

```bash
# Valid commit formats
intershell commit "feat(package): add new feature"
intershell commit "fix: resolve bug"
intershell commit "chore(deps): update dependencies"

# Invalid formats are rejected
intershell commit "my commit message"  # ❌ Invalid
```

### CI/CD Pipeline

In your GitHub Actions workflow:

```yaml
- name: Get affected packages
  id: affected
  run: intershell ci:attach-affected -o affected -m turbo

- name: Build affected packages
  run: turbo build ${{ steps.affected.outputs.affected }}
```

## 🔌 Exports

InterShell exports both the CLI and programmatic APIs:

```typescript
// CLI usage
import { colorify } from "intershell/core";
import { EntityPackage, EntityCommit } from "intershell/entities";

// Use entities programmatically
const packages = await EntityPackage.getAllPackages();
const commit = EntityCommit.parseByMessage("feat: new feature");
```

## 🤝 Requirements

- **Bun** >= 1.0.0
- **TypeScript** >= 5.9.3 (peer dependency)
- **Turbo** >= 2.5.8 (peer dependency, for monorepo support)
- **Biome** >= 2.1.2 (peer dependency, for code formatting)
- **Lefthook** >= 1.12.4 (peer dependency, for git hooks)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

InterShell is built with Bun and designed for modern monorepo workflows.
