# Setup Instructions

Follow these steps to set up Roboreviewer on your local machine.

## Installing And Running It

Still in beta, so no package available yet. Coming soon.

### Local setup

```bash
npm link
roboreviewer init
```

If you do not want to link it globally, you can run it directly:

```bash
node --experimental-strip-types ./bin/roboreviewer.ts init
```

Inside a target repository, the normal first run is:

```bash
roboreviewer init
roboreviewer review --last
```

## Adapter Requirements

To use live agent adapters, the corresponding CLIs need to already exist and be authenticated on your machine.

`codex`

- `codex` CLI installed
- usable in non-interactive mode

`claude-code`

- `claude` CLI installed
- usable in `--print` mode

`coderabbit`

- `coderabbit` CLI installed if enabled in config

The `mock` adapter exists so the full workflow can still run end to end in a deterministic way during development and testing.

## Packaging

This repository is already shaped like an npm CLI package through the `bin` entry in `package.json`.

That means:

- you can use it locally today via `npm link`
- it can be published later to npm
- after publishing, users will be able to run it through `npx`

## Tests

Default test suite:

```bash
npm test
```

This exercises the deterministic mock workflow end to end.

Optional live adapter smoke tests:

```bash
npm run test:live:codex
npm run test:live:claude
npm run test:live:all
```

These are opt-in because they depend on local credentials, installed CLIs, and networked model access.

Linting:

```bash
npm run lint
```

Type checking:

```bash
npm run typecheck
```

Combined local verification:

```bash
npm run ci
```
