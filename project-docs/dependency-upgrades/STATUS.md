# Dependency upgrades — status

## 2026-09-05 pass (first deliberate upgrade cycle)

Plan: [`2026-09-05-plan.md`](2026-09-05-plan.md). Commits `aaa6c22..42644a0` on `main`, one per step.
Outcome and rationale per package: `CHANGELOG.md` → *[Unreleased] - 2026-09-05 (dependency upgrade pass)*.

### Held, and what unblocks each

| Package | Held at | Latest | Unblocks when |
|---|---|---|---|
| `typescript` | 6.0.3 | 7.0.2 (Go-native) | tsup's dts step, typescript-eslint (peer `<6.1.0`) and `scripts/lib/legacy-style-opener.ts` move to the `typescript/unstable/*` API. Our tsconfigs are already 7.0-clean (`tsc` reports no deprecations); only `tsup.config.ts`'s `ignoreDeprecations: "6.0"` (tsup injects `baseUrl`) must go. |
| `eslint`, `@eslint/js` | 9.39.5 | 10.x | `eslint-config-airbnb-extended` peers `eslint ^10`. |
| `vitest`, `@vitest/coverage-v8` | 4.1.11 | 5.0.0 (2026-09-03) | A few 5.0.x patches. Then: rewrite `tests/vitest.d.ts` to `Matchers<R, T>`, decide on `clearMocks: true` default. Node ≥22.12 is already satisfied. |
| `esbuild` | 0.27.7 | 0.28.x | tsup depends on `esbuild ^0.28`. Then re-verify `cssTextPlugin` (`scripts/build-playground.ts`). |
| `opentype.js` | 1.3.4 | 2.0.0 | Upstream gates or catches the unconditional `ccmp` step in `Bidi.applyFeaturesToContexts` (issue #627 class). Symptom on 2.0.0: `substFormat: 2 is not yet supported` from `Font.getPath` with Inter; 15 font tests fail. Re-run: `npx vitest run tests/font-provider.test.ts tests/svg-text-outliner.test.ts tests/font-glyph-extraction.test.ts tests/compiler-worker-fonts.test.ts tests/textblock.test.ts tests/google-fonts.test.ts tests/font-loader.test.ts`, then `npx tsx src/cli.ts website/blog/samples/post40/shattered-glyph.pathogen --output-svg-file … --png …`. Keep `@types/opentype.js` (2.0 ships no types). |
| `@types/node` | 24.x | 26.x | Runtime moves past 24. Match the pinned runtime (`.node-version`), not "latest". |

### Gates used (re-run these for the next pass)

```
npm run build && npm run build:website && npm run build:vscode
npx vitest run                                   # 131 files / 5482 pass / 1 todo
npx tsc --noEmit -p tsconfig.json  | grep -c "error TS"   # 80 pre-existing (44 in dead _legacyGenerateSvg)
npx tsc -p playground/tsconfig.json | grep -c "error TS"  # 7 pre-existing
npx eslint . ; echo $?                           # 1 (problems), never 2 (crash)
npm run check:completions                        # ts-morph regen byte-identical (pre-commit hook)
npx tsx scripts/build-vendor.ts                  # svg2pdf regex patch applies exactly once
npm run build:docs / build:blog                  # diff website/docs-static (gitignored) + git status website/blog-static
node <built cli> <sample> --png …                # built CLI must render (puppeteer/esbuild are external)
```

### Pre-existing debt surfaced, not fixed

- `src/cli.ts` `_legacyGenerateSvg` is dead code with 44 unresolved identifiers.
- No CI job runs tests, lint or typecheck; nothing runs `tsc` over `src/` except tsup's dts step.
- Lint has ~5.8k unenforced problems.
- `.vsix`: "language server does not activate when installed from .vsix" (`packages/vscode-pathogen/CLAUDE.md`). The bundler copies `vscode-languageclient` from the *root* node_modules, where it is not installed.
- Cloudflare Pages runs `npm ci` with devDependencies, so Puppeteer downloads Chrome on every Pages build; check whether `PUPPETEER_SKIP_DOWNLOAD=1` is set in the Pages environment.
