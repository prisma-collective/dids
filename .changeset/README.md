# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs for published packages.

## Pre-release mode

The repo is in **experimental** pre mode (`.changeset/pre.json`). All versions are suffixed (e.g. `0.1.0-experimental.0`) and publishes use the `experimental` npm dist-tag — not `latest`.

## Adding a changeset

When your PR includes changes that should trigger a new npm release, run:

```bash
pnpm changeset
```

Follow the prompts to select affected packages and describe the change. Commit the generated file in `.changeset/`.

## Release flow

1. Merge a PR that includes one or more changeset files.
2. The GitHub Actions release workflow opens a **Version Packages** PR.
3. Merging that PR bumps versions, updates changelogs, and publishes to npm under `@experimental`.

See [documentation/PUBLISHING.md](../documentation/PUBLISHING.md) for full maintainer instructions.
