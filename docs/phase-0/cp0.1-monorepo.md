# CP0.1 — Monorepo Structure

This checkpoint establishes the structural foundation of the repository by configuring the monorepo with pnpm workspaces. The goal is to allow the mobile app, the backend, and the shared packages to coexist inside a single repository with unified dependency management, consistent tooling, and a clear dependency graph between workspaces.

---

## Files Created

| File | Description |
|---|---|
| `pnpm-workspace.yaml` | Defines the three project workspaces: mobile app, backend API, and shared package |
| `package.json` | Root package manifest with convenience scripts and global devDependencies shared at repository level |
| `tsconfig.json` | Base TypeScript configuration extended by all workspaces to keep compiler rules consistent |
| `.gitignore` | Covers `node_modules` at all levels, build outputs, environment files, and operating system artifacts |
| `apps/mobile/package.json` | Declares the Expo mobile app workspace and its mobile-specific scripts and dependencies |
| `apps/api/package.json` | Declares the Node.js backend workspace and its API-specific scripts and dependencies |
| `packages/shared/package.json` | Declares the shared internal package that exports tokens, schemas, and reusable types |

---

## Workspace Configuration

The repository uses pnpm workspaces to treat multiple packages as one coordinated project while still preserving clear package boundaries.

The workspace layout is defined in `pnpm-workspace.yaml`:

- `apps/mobile`
- `apps/api`
- `packages/shared`

The key dependency rule in this checkpoint is that both application workspaces depend on the shared package through the `workspace:*` protocol:

- `apps/mobile` depends on `@blendi/shared`
- `apps/api` depends on `@blendi/shared`

Using `workspace:*` instructs pnpm to resolve `@blendi/shared` from the local workspace instead of looking for it in the public npm registry. In practice, this means that changes made inside `packages/shared` are immediately available to `apps/mobile` and `apps/api` without publishing a package, changing versions manually, or reinstalling dependencies.

That local resolution is what makes the monorepo useful here: shared contracts can evolve together with the consumers that depend on them, while still remaining an explicitly versioned internal package.

---

## TypeScript Configuration

TypeScript is configured in a cascading model.

The root `tsconfig.json` defines the strict global baseline used across the repository, including:

- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`

It also centralizes additional rules such as `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, declaration output, source maps, JSON module support, and consistent file-name casing.

Each workspace has its own `tsconfig.json` that extends the root configuration through:

```json
{
  "extends": "../../tsconfig.json"
}
```

From that shared baseline, each workspace adds settings specific to its runtime:

- `apps/mobile/tsconfig.json` adds React Native JSX support, DOM libs, path aliases, and `noEmit: true`
- `apps/api/tsconfig.json` switches to CommonJS and Node resolution, and defines `outDir: "dist"` and `rootDir: "src"`
- `packages/shared/tsconfig.json` enables `composite`, declaration output, and defines `outDir: "dist"` and `rootDir: "src"`

This cascade is important because it keeps TypeScript behavior consistent across the entire codebase without copying the same compiler rules into every workspace. The strict rules are declared once at the root, while each package remains free to add only the runtime-specific overrides it actually needs.

---

## Technical Decisions

### Why pnpm Instead of npm or Yarn

pnpm was chosen because it is materially better suited to a multi-package repository:

- It installs dependencies faster in large workspace setups
- It uses symlinks and a content-addressable store instead of duplicating package trees, which saves disk space
- It has mature native workspace support with clear local package resolution semantics

For this project, those properties matter because the mobile app, backend, and shared package all evolve together and frequently reuse common dependencies and tooling.

### Why the Root Package Has Only Global Dev Tooling

The root `package.json` intentionally does not act as an application package. It contains repository-level scripts and global devDependencies, such as TypeScript, but does not own runtime dependencies for the app or API.

This decision keeps dependencies isolated by workspace. That makes version ownership explicit, reduces accidental cross-package coupling, and makes it clear which part of the system actually requires a given dependency.

---

## Pending Items

No items are pending for this checkpoint. The monorepo structure is complete, stable, and ready to support the subsequent checkpoints.

---

## Validation

This checkpoint can be validated with two simple checks.

### 1. Install All Workspaces From the Root

Running the following command at repository root should install dependencies for all workspaces without errors:

```bash
pnpm install
```

Expected outcome:

- pnpm recognizes all three workspaces
- a single lockfile is maintained at the root
- local workspace links are created correctly

### 2. Import the Shared Package From Another Workspace

Importing a type or export from `@blendi/shared` inside `apps/api` should work without additional linking or manual package publishing.

Example:

```ts
import type { RegisterInput } from '@blendi/shared';
```

Expected outcome:

- TypeScript resolves the import successfully
- the API workspace can consume shared contracts immediately
- local changes in `packages/shared` propagate to consumers without reinstall steps