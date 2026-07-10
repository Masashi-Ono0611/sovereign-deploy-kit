# Distribution research — single-binary friendly install (2026-05-10)

**Status:** research draft. No code changes yet. Captures the option space
for moving away from "npm install + Node runtime required" toward a
single-binary install (Bun-compiled, Node SEA, Deno compile, …) plus
secondary distribution channels (Homebrew, Scoop, `curl | sh`, Docker).

The goal is **lower friction for end users**, not replacing the npm
package. npm publish stays — `npx ton-sovereign-deploy` is still the
fastest path for Node users — but we want a parallel "download one
binary, run" experience for non-Node operators and self-hosters.

## Current shipping state

- `package.json` `bin: dist/cli.js` → npm install requires Node ≥ 18
- Bundler: `tsup` (CJS, target `node18`)
- Runtime deps with relevant compat profile:
  - `@ton/ton`, `@tonconnect/sdk` — pure JS, WebSocket bridge for TonConnect
  - `chokidar@5` — ESM-only since Nov 2025, requires Node ≥ 20, bundles
    `fsevents` (macOS) as the sole optional native dep
  - `commander`, `chalk@4`, `ora@5`, `qrcode-terminal` — pure JS, TTY-aware
- Side artifacts: `scripts/*.cjs`, `scripts/*.sh` (test helpers, daemon
  probes). Most are dev-only, but a few (`close-storage-contract.cjs`,
  `dns-probe.cjs`) get invoked from the CLI flow and would need explicit
  bundling treatment.
- Targets: darwin / linux / win32 (declared in `package.json#os`)

## Option matrix

| Option | Single binary | Cross-compile | npm-compat | Native modules | Maintenance | Verdict |
|---|---|---|---|---|---|---|
| **A. Bun `--compile`** | yes (~50–90 MB) | yes (linux/macOS/win × x64/arm64) | high (reads `package.json`) | N-API works, `.node` files can be embedded into the binary | active, well-funded | **primary candidate** |
| **B. Node SEA (`--build-sea`)** | yes | **no** — must build per-OS/arch | full | yes, via `assets` + `process.dlopen` | Stability 1.1 "Active development" as of Node 22+ | viable but needs 4–6 CI runners |
| **C. Deno `deno compile`** | yes | yes | partial (`npm:` specifiers); `deno compile` historically blocked, recently improving | limited | active | medium-high risk for our deps |
| **D. `pkg` / `nexe` / `caxa`** | yes | partial | full | partial | `pkg` archived, others stagnant | not recommended for new work |
| **E. Channel-only (Homebrew / Scoop / `curl \| sh` / Docker)** | n/a (still ships `dist/cli.js` + Node) | n/a | n/a | n/a | low cost | **complementary**, do alongside whichever runtime path we pick |

Sources: [Bun executables docs](https://bun.com/docs/bundler/executables),
[Mamezou — Bun cross-compile](https://developer.mamezou-tech.com/en/blogs/2024/05/20/bun-cross-compile/),
[Node.js SEA docs](https://nodejs.org/api/single-executable-applications.html),
[Joyee Cheung — improving SEA building (2026-01)](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/),
[Deno node compatibility](https://docs.deno.com/runtime/fundamentals/node/),
[Bun #8967 — embed node_modules into binary](https://github.com/oven-sh/bun/issues/8967).

## Per-option deep dive

### A. Bun `bun build --compile` — primary candidate

**What it produces.** A standalone executable with the Bun runtime
embedded. End users do **not** need Node, npm, or Bun installed.

**Cross-compile.** One CI host can produce binaries for all of:
`bun-linux-x64`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`,
`bun-windows-x64`. This collapses the release matrix to a single GHA
job (vs. 5+ for SEA). Confirmed working as of v1.1+ (May 2024) and
documented through 2026.

**Native modules.** Bun implements N-API; community guidance through
2026 is that prebuilt N-API addons load without recompile. `.node`
files can be embedded into the compiled executable via the bundler
(see Bun #8967 / release notes). For our stack the only native dep is
`fsevents` (optional), which Bun handles transparently (or falls back
to its own native FS watcher; see "compatibility risks" below).

**Asset embedding.** `import data from "./foo.json" with { type: "file" }`
at build time replaces the import with a `$bunfs/`-prefixed path
inside the executable. Useful for our `scripts/*.cjs` helpers and
`templates/` directory if we choose to bundle them rather than
fetching at runtime.

**Bytecode + minify.** `--bytecode` (CJS only, currently) precompiles
JS to bytecode for faster startup; combine with `--minify` to trim
size. Both are stable.

**Replaces tsup.** `bun build` is the bundler too — the `tsup.config.ts`
+ `tsup` devDep can be deleted.

**Open questions / risks:**

1. `chokidar@5` is ESM-only; our build is currently CJS via tsup. The
   migration to Bun build flips us to ESM (Bun is ESM-first). This is
   a code change but an easy one.
2. TonConnect bridge uses `EventSource`/WebSocket. Bun's WS impl is
   strict; some libs that lean on Node's `ws` package as a polyfill
   need version pins. Empirical test required.
3. macOS Gatekeeper / Windows SmartScreen will warn on unsigned
   binaries. Codesigning is out-of-band of Bun and applies to any
   binary-shipping option (SEA, Deno included).

### B. Node.js SEA (`node --build-sea`)

**Status.** Stability 1.1 ("Active development") in Node 22+. Node
25.5.0 (Jan 2026) added `node --build-sea sea-config.json`, collapsing
the previous postject 3-step flow into one command. Postject's
injection logic was ported into core via LIEF.

**Cross-compile.** **Not supported.** Per Node.js docs:

> When generating cross-platform SEAs, `useCodeCache` and `useSnapshot`
> must be set to false to avoid generating incompatible executables.

In practice this means a CI matrix of `{linux-x64, linux-arm64,
darwin-x64, darwin-arm64, windows-x64}` runners — five jobs, with
known caveats (Linux arm64 inside Docker produces ELF binaries with a
broken hash table; addons crash on `process.dlopen()`).

**Native addons.** Supported via `assets` + `process.dlopen`. More
boilerplate than Bun's transparent embedding.

**Why we'd pick it anyway.** Maximum runtime fidelity — same Node we
already test against. If we hit a Bun incompat we can't resolve, this
is the safe fallback.

### C. Deno `deno compile`

**npm specifier compat with `deno compile` was the historical blocker**
(tracked in [deno#15960](https://github.com/denoland/deno/issues/15960)).
March-2026 Deno docs describe a virtual `node_modules` VFS inside the
compiled binary, suggesting the gap is closing. Until verified
empirically with our specific deps (`@ton/ton`, `@tonconnect/sdk`,
`chokidar`), we should treat this as "promising but unverified".

**Cross-compile.** First-class — one of Deno's headline features.

**Reason to defer.** Bun has the same cross-compile story with a
broader npm-compat track record, and our codebase is already
Node-shaped. Picking Deno would be a bigger pivot for marginal gain.

### D. Legacy bundlers (`pkg`, `nexe`, `caxa`)

`pkg` (vercel) is archived. `nexe` is alive but lags Node majors.
`caxa` ships the entire `node_modules` and Node runtime as a tarball
extracted on first run — works but is large and slow to start.

**Verdict.** Skip for new work. Listed only so reviewers don't
re-litigate.

### E. Distribution-channel-only (additive, no runtime change)

Independent of which runtime path we pick, these reduce friction
**today** with the existing npm package:

- **`curl -fsSL https://… | sh` install script.** Detect `uname` +
  arch, download the right binary (or run `npm i -g` if Node is
  present), drop it into `~/.local/bin` or `/usr/local/bin`. Industry
  standard pattern (rustup, deno, bun, fnm, golangci-lint).
- **Homebrew tap.** Repo `homebrew-ton-sovereign-deploy` with a
  `Formula/ton-sovereign-deploy.rb`. Each release CI job computes
  `shasum -a 256` of the binary and bumps the formula. Watch out:
  GitHub's tarball generation is async — a 10s sleep before the curl
  avoids the 404 / zero-byte race.
- **Scoop bucket.** Windows-side equivalent: ZIP + JSON manifest in a
  `scoop-ton-sovereign-deploy` repo.
- **Docker image.** `ghcr.io/<org>/ton-sovereign-deploy:0.6.3`,
  multi-arch via buildx. Useful for CI/CD pipelines where adding a
  Node toolchain is annoying. Image stays small (~50 MB) if we base
  on `gcr.io/distroless/nodejs22` or ship a Bun-compiled binary on
  `scratch`.

## Compatibility risks against our specific deps

| Concern | Risk | How we'd validate |
|---|---|---|
| `chokidar@5` (ESM-only, fsevents) on Bun | low — Bun supports ESM natively, fsevents is a prebuilt N-API addon | spike: run `--watch` on macOS, confirm sub-second event latency vs. polling fallback |
| `@tonconnect/sdk` WebSocket bridge | medium — TON docs explicitly list Bun as a supported install target for `@tonconnect/ui`, but server-side SDK use is less covered | spike: full sign flow against testnet, including QR + deep-link round trips |
| `@ton/ton` BoC parsing / wallet contract APIs | low — pure JS, big-int heavy; `@ton/test-utils` already ships `bun:test` matchers | run existing `vitest` suite under `bun test` |
| `ora@5` + `chalk@4` TTY behavior in compiled bin | low — both write through `process.stdout`, no native deps | manual smoke test on macOS Terminal, Linux gnome-terminal, Windows ConPTY |
| `qrcode-terminal` Unicode block rendering | low | manual visual diff |
| `scripts/*.cjs` invoked at runtime | medium — embedding strategy must be decided | grep CLI for `require('./scripts/...')` and decide bundle vs. ship-alongside |
| `process.dlopen` quirks on Linux arm64 in Docker (SEA only) | n/a if we pick Bun | only relevant for Option B |
| Code signing (macOS Developer ID, Windows Authenticode) | medium cost ($99/yr Apple, $200–500 EV cert Windows) | scope decision, not a technical blocker |

## Recommendation

**Pick Option A (Bun) as the runtime, layer Option E (channels) on
top, keep npm publish.**

Concretely:

1. Replace `tsup` with `bun build`. Add a `bun build:bin` script that
   produces `dist/cli.js` (for npm) and `dist/bin/<target>/ton-sovereign-deploy`
   (for releases) from the same `src/cli.ts` entry.
2. Cross-compile to 5 targets in one GHA matrix step. Attach to GH
   Releases. SHA256 manifest published alongside.
3. Install script (`install.sh`) hosted at the repo root + a redirect
   from a stable URL (`https://github.com/<org>/sovereign-deploy-kit/releases/latest/download/install.sh`).
4. Homebrew tap repo, formula auto-bumped from CI.
5. Scoop bucket repo, manifest auto-bumped from CI.
6. Optional: distroless Docker image for CI/CD users.

Why not SEA: cross-compile gap forces 5× CI runners and the
ARM64-Linux-in-Docker dlopen bug is a real ops trap. Why not Deno:
npm-in-`deno-compile` is too new to bet release plumbing on without a
month of empirical confidence.

## Migration plan (sprint-sized, ~1 week)

**Day 1 — spike branch.** Branch off `claude/research-package-managers-NHABn`
into `spike/bun-build`. `bun install`, `bun run vitest run` (compat
check), `bun build --compile --target=bun-darwin-arm64 src/cli.ts
--outfile dist/bin/ton-sovereign-deploy`. Smoke test the binary
against testnet. **Go/no-go decision** based on the three medium-risk
items in the table above.

**Day 2 — build pipeline.** Replace `tsup` → `bun build` for the npm
artifact. Keep `dist/cli.js` shape compatible so existing npm
installs don't break. Update `package.json#scripts`.

**Day 3 — release matrix.** GHA workflow:

```yaml
strategy:
  matrix:
    target:
      - bun-linux-x64
      - bun-linux-arm64
      - bun-darwin-x64
      - bun-darwin-arm64
      - bun-windows-x64
```

Single Linux runner cross-compiles all five. Output uploaded to GH
Releases with checksum manifest.

**Day 4 — install.sh + Homebrew tap.** Standalone repo
`homebrew-ton-sovereign-deploy`. Formula is templated; CI bumps SHA
+ version on tag. install.sh detects uname + arch, downloads, chmods,
verifies SHA.

**Day 5 — Scoop + Docker (optional, can slip).** Mirror Homebrew flow
for Scoop. Docker image as a separate workflow.

**Day 6 — README + migration note.** Three install paths documented
in priority order: `curl | sh` → `brew` → `scoop` → `npm i -g` →
`docker run`.

**Day 7 — buffer for codesigning, smoke tests, regression hunt.**

## Open questions

1. **Code signing budget.** Apple Developer ID + Windows EV cert is
   ~$300–600/yr. Are we OK shipping unsigned binaries with a
   "right-click → Open" workaround in the README until v1.0?
2. **Binary hosting.** GH Releases (free, 2 GB/asset cap, fine for
   us) or a CDN (Cloudflare R2, etc.) for faster downloads from JP /
   APAC?
3. **`--watch` daemon lifecycle inside compiled bin.** chokidar +
   our daemon spawning logic interact with `process.exit` and signal
   handlers; verify Bun's signal handling matches Node's on Windows
   specifically (historically the weakest platform for both runtimes).
4. **`scripts/*.cjs` strategy.** Embed via `with { type: "file" }`
   and rewrite call sites, or extract to a library? Decision
   affects the spike's scope.
5. **Telemetry / version-check.** If we add an "update available"
   nudge, where does it live? npm has `npm outdated`; binaries don't.
   Roll our own check against GH Releases API, or skip until v1.0?
6. **Naming.** Binary name on disk: keep `ton-sovereign-deploy` (long)
   or alias to `tsd` for the binary path while preserving the npm
   bin name for back-compat?

## Further research (next pass)

- Empirical Bun compatibility test against `@tonconnect/sdk`'s full
  sign flow on testnet. Can't be answered from docs alone — needs a
  spike PR.
- Concrete sizing: actual binary size with/without `--minify
  --bytecode` against our dependency graph. Likely 60–80 MB; if
  >100 MB we revisit.
- Compare cold-start time: `node dist/cli.js --help` vs. compiled Bun
  binary vs. SEA binary. Baseline matters for `--watch` UX where the
  daemon spawn dominates.
- Audit downstream: any consumers of this kit pinning `node@18`
  specifically? `engines.node: ">=18"` would relax to "any" once we
  ship binaries.

## Sources

- [Bun — Single-file executable docs](https://bun.com/docs/bundler/executables)
- [Bun cross-compile announcement (Mamezou, 2024-05)](https://developer.mamezou-tech.com/en/blogs/2024/05/20/bun-cross-compile/)
- [Bun #8967 — embed full node_modules into binary](https://github.com/oven-sh/bun/issues/8967)
- [Bun v1.0.23 release notes (NAPI .node embedding)](https://bun.sh/blog/bun-v1.0.23)
- [Building CLI Applications with Bun (2026-01)](https://oneuptime.com/blog/post/2026-01-31-bun-cli-applications/view)
- [Bun Compatibility 2026: npm, Node & Next.js](https://www.alexcloudstar.com/blog/bun-compatibility-2026-npm-nodejs-nextjs/)
- [Node.js — Single executable applications](https://nodejs.org/api/single-executable-applications.html)
- [Joyee Cheung — Improving SEA building (2026-01-26)](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/)
- [Node.js 25.5 `--build-sea` announcement](https://progosling.com/en/dev-digest/2026-01/nodejs-25-5-build-sea-single-executable)
- [Deno — Node and npm compatibility](https://docs.deno.com/runtime/fundamentals/node/)
- [Deno 2 announcement](https://deno.com/blog/v2.0)
- [TON Connect SDK — installation (lists Bun)](https://docs.ton.org/v3/guidelines/ton-connect/guidelines/developers)
- [@ton/test-utils (bun:test matchers)](https://github.com/ton-org/test-utils)
- [chokidar README (v5, ESM-only, Nov 2025)](https://github.com/paulmillr/chokidar)
- [Shipping a CLI: Homebrew tap, Scoop bucket, SHA dance](https://dev.to/vineethnkrishnan/the-second-half-of-shipping-a-cli-homebrew-tap-scoop-bucket-and-the-sha-dance-bmi)
- [Creating Your First Homebrew Tap](https://kristoffer.dev/blog/guide-to-creating-your-first-homebrew-tap/)
- [Scoop installer](https://github.com/ScoopInstaller/scoop)
