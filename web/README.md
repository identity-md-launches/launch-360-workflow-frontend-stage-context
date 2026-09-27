# Oddsmaker frontend

One static React/TypeScript page for the deployed Sepolia ParimutuelMarket. All stakes and payouts use ODMK. These are test markets with no real value. The approved workflow explicitly excludes an in-page swap: obtain ODMK by swapping Sepolia ETH in the launch pool outside this page.

## Install, build and preview

Requires Node 22.12+ (worker: Node 24.21.0), npm, and Git history containing the pinned deployed source commit. From the repository root:

```sh
npm ci --prefix web
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run preview -- --port 4174
```

Open the preview URL printed by Vite. Rebuild after editing source; preview serves the committed root `dist/`. Do not use the root Foundry configuration for frontend builds. The source-only Vite `dev` script requires the generated `imd-deployment.json` and `abi/` assets to be served at the same base path; production preview is the supported complete local workflow.

The production export uses `base: './'`, local bundled assets, and anchor navigation. Serve all of `dist/` unchanged, including the manifest and ABI directory. It works under a gateway prefix (tested at `/preview/`) without server rewrites. Static hosting still requires runtime connectivity to public RPCs and a browser wallet for signing. No backend, indexer, private keys, API keys, external fonts, analytics, or WalletConnect service is used. An injected EIP-1193 browser wallet is the supported connector; no WalletConnect project ID was supplied.

## Deployment configuration and provenance

`web/deployment/handoff.json` and `network.json` preserve the supplied handoff as build inputs. `web/scripts/export.mjs` reads the implementation-derived ABI bytes with `git show <sourceCommit>:docs/abi/<Contract>.json`. It recursively sorts JSON object keys, preserves array order, and compares the Keccak-256 of compact canonical JSON with each attested ABI hash. A mismatch fails the build. It then copies the exact pinned ABI bytes to `dist/abi/`.

After Vite completes, the exporter writes `dist/imd-deployment.json`: the exact launch, chain, deployed source commit, attestation, contract set, addresses, ABI hashes, and unchanged network object. Every other exported file is declared with a lowercase SHA-256 digest. The manifest deliberately excludes itself. Regenerate it after **any** export change by running the full build. The generator caps the export at 128 assets, 8 MiB per file, and a stricter 8 MiB total to leave ample publication budget.

`src/config.ts` fetches this same manifest and referenced ABI JSON at runtime, verifies ABI hashes again, and constructs its RPC client, chain and explorer links from it. It does not embed another deployment map. Wallet-add parameters are derived from the network block; the builder asserts they equal the supplied `walletAddChain` object. Unknown-chain switch failures offer that exact network via `wallet_addEthereumChain`, then retry switching. No Uniswap contract is called by this page, as required by the approved no-swap workflow.

## Reads, actions and safety boundaries

- Contract reads verify RPC chain ID, nonempty code for both deployed contracts, `ParimutuelMarket.token()` against the attested token, and ODMK metadata. Balances and allowance use the returned immutable token address. Failed checks disable writes.
- Market enumeration uses `marketCount()` and contract views at one block, six newest markets per page. Filters apply to the loaded page, and this is explained in the empty state. No backend or event-indexing dependency. Reads refresh every 20 seconds and after confirmed actions. The current block is visible; errors preserve a stale-state warning.
- Create validates a nonempty, round-tripped bytes32 UTF-8 question, nonzero resolver, and closing time within the contract's duration limits. The UI adds a one-minute inclusion buffer to the minimum; all times are labeled as local time.
- Bet requires an open market, sufficient balance, the correct chain, and an account other than the resolver. The exact-amount ODMK approval is its own transaction before a bet. Existing sufficient allowance is shown explicitly. Amounts reject excess precision instead of silently rounding. Application calls send no ETH; gas still uses Sepolia ETH.
- Resolve is available only to the named resolver during `[closeTime, closeTime + 7 days)`, with an explicit finality acknowledgment. YES, NO and INVALID are supported. A winner with no stake is treated as INVALID by the contract.
- At `closeTime + 7 days`, unresolved markets offer anyone `voidMarket`. Claims use `claimable()` and `hasClaimed()` so losing and already-paid wallets cannot submit an enabled claim.
- Every write simulates against current RPC state before wallet signing, checks the live wallet account and chain before and after simulation, and waits for a successful receipt. Rejections, decoded contract errors, pending transactions, reverted receipts, and explorer links are visible. A 120-second receipt timeout retains the hash and tells the visitor to check the explorer before retrying.
- Account/chain changes clear the displayed wallet snapshot. Fresh reads are required; writes refuse snapshots older than 60 seconds. Displayed close timing extrapolates from the last observed block; simulation/contract execution is authoritative at boundaries. Transactions can still race state changes or revert during inclusion.

The human resolver is trusted and could bet through another address. No oracle or appeal exists. Payouts are pull-based; winners divide the total pool pro rata, invalid/void markets refund deposited stakes, and rounding leaves at most one ODMK base unit per winner in the contract. There is no market fee.

## Validation

```sh
npm --prefix web run typecheck
npm --prefix web run build
# Use an installed Chromium, or install a compatible Playwright browser first.
CHROMIUM_PATH=/path/to/chrome npm --prefix web test
npm --prefix web run check:rpc
npm --prefix web run verify
```

`tests/interaction.mjs` starts and closes its own temporary static server and browser. Its EIP-1193 provider and all transaction RPC calls are mocked; it broadcasts no real transactions. It verifies the production export under a gateway subpath. `CHROMIUM_PATH` is optional when the expected Playwright browser is installed. On this worker, the bundled browser at `/opt/imd-worker/ms-playwright/chromium-1246/chrome-linux64/chrome` was used; Playwright 1.55's downloader did not recognize the worker's Ubuntu 26.04 platform. Browser binaries and npm caches are not delivery artifacts.

`check:rpc` performs read-only chain/code/token checks against all configured endpoints. `verify` checks the export inventory, ABI provenance/hashes, handoff/network equality, relative asset URLs, allowed changed paths, the combined tracked/untracked delivery size, and absence of dependency caches or submodules. New files are included without staging because this worker mounts `.git` read-only.

See `docs/VALIDATION.md`, `docs/DESIGN.md`, and `docs/evidence/`. Real wallet-extension signing, on-chain transactions, native-device/screen-reader testing, and publication/CID checks remain unperformed. Publication is the subsequent control-plane stage; no hosted URL or CID is claimed here.

## Delivery scope and size

Only `web/**`, `dist/**`, and `docs/**` are delivered. The explicit ignore-file path budget is **`web/.gitignore` only**, under 1 KiB; its patterns exclude dependencies and caches at every nesting level inside `web/`. Root configuration, source contracts, ABI provenance files and dependencies remain unchanged. Do not commit `node_modules`, npm caches, vendored registries or dependency archives. The complete submission bundle must remain below 8 MiB.

The task's root `DESIGN.md` request conflicts with its higher-priority allowed-path restriction. Its full required content is delivered at `docs/DESIGN.md` instead.

The managed worker prevented `git add`/`git commit` with a read-only `.git/index.lock` error. All delivery files remain available in the workspace for source collection; the limitation is recorded in `docs/VALIDATION.md`. An isolated temporary Git copy is used only to verify submission bundle size.
