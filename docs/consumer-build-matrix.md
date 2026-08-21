# Consumer Build Matrix

InkLayer Core validates the published tarball rather than workspace aliases.
`npm run check:consumer` creates fresh consumer directories, installs one packed
artifact, and runs the following pinned production-build matrix.

## Supported matrix

| Consumer | Pinned toolchain | Target | Executable evidence |
|---|---|---|---|
| Vite | Vite 8.2.1, TypeScript 6.0.3 | Browser ESM plus Node import | Typechecks every public entry, builds production assets, imports public CSS, emits the bundled PDF Worker, and imports the package root in Node. |
| Webpack | Webpack 5.101.3, webpack-cli 6.0.1, css-loader 7.1.2, mini-css-extract-plugin 2.9.4 | Browser ES2022 | Imports the root and Viewer entries, extracts `inklayer-core/style`, and emits the version-matched `pdf.worker.min.mjs` as a production asset. |
| Webpack SSR | Webpack 5.101.3 | Node 20 target | Bundles root and Viewer imports, executes the production CommonJS server bundle in Node, constructs a Viewer without browser globals, observes `idle`, and destroys it cleanly. |

The package Node engine contract remains `^20.19.0 || >=22.12.0`. Local release
evidence currently runs with Node 24.18.0. Exact matrix versions live in
`scripts/check-consumer.mjs`; changing one is a reviewed support decision rather
than an incidental install update.

## Contract covered

The matrix guarantees that:

- `inklayer-core` and `inklayer-core/viewer` resolve from the packed `exports`
  map in browser and SSR production builds;
- importing or constructing the Viewer during SSR does not evaluate browser-only
  PDF.js runtime code;
- `inklayer-core/style` resolves as CSS and can be extracted by Webpack;
- the default PDF.js Worker is emitted from the package with no consumer-owned
  download or `workerSrc` configuration;
- the Worker remains a separate `.mjs` asset larger than one megabyte, preventing
  accidental inlining or replacement with an empty stub;
- Vite and Webpack consume the same tarball and therefore exercise published
  files rather than source aliases.

## Deliberate limits

This is a build-tool support declaration, not the cross-browser runtime matrix.
Chromium, Firefox, and WebKit interaction support is tracked by `CORE-013`.
Next.js is not separately claimed in V1: its Webpack mode is expected to use the
same package contracts, but framework-specific server/client boundaries require
their own executable consumer before they become a named supported target.

Applications may still override `workerSrc` for self-hosting or Content Security
Policy requirements. Such an override changes deployment ownership and is not
the zero-configuration path proved here.

## Reproduction

Build the package before running the standalone matrix:

```sh
nvm use 24.18.0
npm run build
npm run check:consumer
```

`npm run check` runs the same matrix after unit, integration, Chromium, library,
example, and package checks.
