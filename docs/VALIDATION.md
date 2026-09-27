# Frontend validation — Oddsmaker

Worker report for the single-page Sepolia frontend. Source, export and evidence are complete for the permitted frontend scope; committing in the managed workspace is blocked by its read-only `.git` mount. This is local validation evidence, not independent certification or a claim that publication checks passed.

## Scope, authority and assumptions

Read the pinned workflow, deployment, network, Better Interface workflow/core principles for all six domains, documentation method, implementation-derived ABI documentation, deployed application source and both protected contract test inputs. The approved workflow specifically requires **no in-page swap**, so the generic swap reference does not add one. Primary actions are createMarket, exact ODMK approval, yes/no bet, resolver settlement, timeout void and claim. Lists use views only; six markets per page avoids unbounded RPC work.

The immutable deployment source is `f65175c1d478383f33eb6dbbc24643c09f78f9ac`. Solidity, root build configuration, original ABI files and contract dependencies are unchanged. The frontend reads the same `dist/imd-deployment.json` delivered to the publisher. Build and runtime both verify canonical ABI Keccak hashes. Network/wallet-add configuration is taken from the supplied network input, with no credentials or remembered router addresses.

The task's root `DESIGN.md` criterion conflicts with its overriding write allowlist. Required design content is delivered at `docs/DESIGN.md`; no root file is added. The explicit ignore budget is `web/.gitignore` only, under 1 KiB. No other ignore file is changed.

Design assumptions: an English, light-theme desktop/mobile market board; system typography; CSS-only decoration; no wallet service requiring a public project ID. An injected EIP-1193 wallet is supported. No publication, contract changes, redeployment, or real transactions are within this delivery.

## Commands and outcomes

| Check | Actual command / mechanism | Result |
| --- | --- | --- |
| Dependency install | `npm install --prefix web --cache /tmp/oddsmaker-npm-cache --no-audit --no-fund` | Completed; exact package versions and npm lock committed. Dependencies/cache excluded. |
| Typecheck + production export | `npm --prefix web run build` (includes `tsc --noEmit`) | Exit 0 after final source changes; Vite built static relative assets and exporter verified both pinned ABI hashes. `evidence/build.txt`. |
| Browser interactions | `CHROMIUM_PATH=/opt/imd-worker/ms-playwright/chromium-1246/chrome-linux64/chrome npm --prefix web test` | Exit 0; all 19 scenarios passed. `evidence/interactions.json`, `evidence/interaction-run.txt`. |
| Public chain checks | `npm --prefix web run check:rpc` | Exit 0; all three public endpoints returned chain 11155111, both nonempty contracts, the correct immutable token, and marketCount 0 at block 11791596. `evidence/live-rpc.json`. No transaction sent. |
| Static/provenance integrity | `npm --prefix web run verify` including new, untracked files | Verifies full asset inventory/SHA-256, exact pinned ABI bytes and canonical hashes, handoff/network equality, scope, relative URLs, size limits and no tracked dependency caches/submodules. `evidence/integrity.json`. |
| Rendered inspection | Assigned browser tool, production Vite preview | Actual live empty state inspected at 1440×1080 and 320×900; mock populated state screenshots also inspected. Resource/console records under `evidence/`. |
| Accessibility automation | axe-core through Playwright, WCAG 2 A/AA + 2.1 AA tags | Zero violations in the tested expanded-form state. Pass and incomplete rule IDs retained in `evidence/accessibility.json`. This is not full accessibility certification. |

The browser installer bundled with Playwright 1.55 did not support the worker's Ubuntu 26.04 platform. The existing installed Chromium binary was used successfully; this is not a missing browser check. The assigned browser's production preview port was 4174. Discovery attempts on port 4173 reached an unrelated existing preview; it was not used as evidence or modified. All final artifacts and checks target Oddsmaker.

The final export has six declared assets (HTML, two JS chunks, CSS and two ABI JSON files) plus its manifest, approximately 0.49 MiB. This leaves substantial room under the 64 MiB publication response budget and 8 MiB submission cap. Exact export/submission file sizes are in `evidence/integrity.json`; the final Git bundle is measured in an isolated temporary Git copy because the managed workspace prevents staging.

## Meaningful interaction coverage

`web/tests/interaction.mjs` serves the real final `dist/` under `/preview/`, injects a mocked browser wallet, and intercepts configured JSON-RPC endpoints. Test markets/wallet balances exist only in the test harness and screenshot evidence, never in the production app. The suite records **zero real transactions**.

1. Relative static loading, runtime manifest/ABIs, disconnected actions.
2. Missing wallet and rejected connection recovery.
3. Wrong-chain action gating and 4902 add-chain flow using the exact supplied wallet parameters.
4. Amount precision, insufficient balance and unmet allowance.
5. Exact approval spender/amount, receipt before yes bet, refreshed position/allowance.
6. No bet boolean and separate fresh approval.
7. Simulation revert reason and no wallet broadcast.
8. Wallet transaction rejection, reverted receipt and transaction explorer recovery.
9. Creation validation/focus and bytes32 round-trip/payload.
10. Account-change reset and resolver bet prohibition.
11. Closing boundary and resolver-only finality acknowledgment/settlement.
12. Seven-day boundary, void, invalid refund, once-only claim.
13. RPC failure, stale-state warning, disabled writes and recovery.
14. Missing code, wrong RPC chain, immutable token mismatch fail closed.
15. Bounded pagination, empty filters and return to results.
16. Viewports 1440, 1024, 800, 540, 375 and 320, plus 200% root text sizing at 320: no horizontal overflow.
17. Keyboard create entry, focused field and automated accessibility rules.
18. Populated desktop/mobile screenshots and no browser console exceptions.
19. Tampered ABI stops deployment initialization.

Account/chain are rechecked just before signing, amounts are encoded using live token decimals, application transactions carry no ETH, and write controls require a fresh verified snapshot. Mocks verify request construction and UI transitions; they do not prove deployed transaction execution or actual wallet-extension behavior.

## Better Interface consolidated review

| Domain | Coverage and evidence | Limitations |
| --- | --- | --- |
| Accessibility — Checked | Native actions/radio/checkbox/details, visible labels, described errors, invalid-field focus, skip link, keyboard create flow, forced-color/reduced-motion source review, 3px visible focus ring inspected in `create-focus.png`, axe scan. | No screen-reader session, physical touch device, exhaustive focus-background traversal or native browser zoom. |
| Layout — Checked | Live and populated desktop/mobile screenshots, six width overflow assertions, doubled text sizing, wrapping controls, relative page source order and bounded lists. Fixed notice and text-enlargement defects. | No localization or RTL implementation is requested; mirrored/pseudolocalized testing not performed. |
| Writing — Checked | Action labels map to invoked functions; preview states stake/unit/side; trust/no-value notice, stale-state recovery, decoded reverts, empty-state next action, allowance step, final settlement acknowledgment. | No translation or user comprehension study. |
| Typography — Checked | System family, descending source scale, 16px inputs, 1.4+ multiline labels, tabular readouts, long questions/addresses and enlarged text inspected. | Cross-platform font rendering and iOS input zoom untested; no web fonts are present. |
| Colors — Checked | Semantic aliases reviewed; seven live computed foreground/background measurements in `contrast-live.json`; smallest listed ratio 6.11:1. axe scan found no tested text contrast failures. Text accompanies all statuses. | No dark mode requested. Manual contrast of every hover/disabled/focus combination was not performed. |
| UI — Checked | Open, selected, empty, pending, rejected, error, confirmed and disabled paths; card/control boundaries; keyboard focus; no overlays; motion guarded by reduced-motion preference. | No slow-motion animation replay; only optional 120ms button feedback exists. No image/video/theme transitions to review. |

### Findings fixed and rechecked

| Severity | Final source location | Observed issue → correction → evidence |
| --- | --- | --- |
| Medium | `web/src/styles.css:1118` | At 320px, the testnet notice's inline link squeezed the explanatory text into a narrow column. Changed mobile notice to an icon/text grid with the link on its own row. Final `mobile-live.png` shows readable wrapping; no overflow. |
| Medium | `web/src/styles.css:1136` | At 320px with 200% root text, header actions and filters widened the page. Added wrapping to header/filter/heading/position groups and minimum-width constraints. `text-size-before.png` / `text-size-after.png`, `text-reflow.json`, and the rerun interaction test demonstrate the fix. |
| Medium | `web/src/model.ts:84` | Simulation of a custom contract error surfaced only viem's generic short message. Walked the error causes to display decoded error names and concrete recovery guidance. The MarketClosed scenario now passes without a wallet broadcast. |
| Low | `web/src/App.tsx:390` | A long transaction error ran directly into its dismissal label. Wrapped the message in its own paragraph. Rejection/revert flows rechecked in the final suite. |
| Medium (source review) | `web/src/useMarkets.ts:343` | Confirmation wording previously implied refresh success before the read completed, and an old account's completion could refresh its old snapshot. Confirmation now says only that the transaction is confirmed, and refresh runs only for the still-current account. Final build and account/receipt scenarios pass. |

No unresolved observed blocker remains in the permitted frontend scope. Validation findings are retained here; `DESIGN.md` documents the final implementation rather than abandoned choices.

## Evidence and remaining limits

- `desktop-live.png`, `mobile-live.png`: real deployed empty state. No fabricated market data in the live page.
- `desktop-fixture.png`, `mobile-fixture.png`: mocked populated board/action state; screenshot fixture values are not live claims.
- `create-focus.png`: visible keyboard focus in the expanded create form.
- `browser-console.txt`, `browser-network.txt`: assigned-browser observation; local resources and live RPC reads succeeded. The final interaction browser also had zero console errors.
- `text-size-before.png`, `text-size-after.png`, `text-reflow.json`: actual layout correction evidence. Root font enlargement is not browser-native 200% zoom.
- Actual extension signing, funded end-to-end writes, mempool races/reorganizations, receipt replacements/timeouts, alternate EIP-1193 implementations and smart-account wallets were not exercised against the live chain. The app handles receipt replacement/timeouts in source, but these paths are not claimed as browser-tested.
- Automated mock checks do not rerun or certify Solidity accounting. The task preserves the deployed contracts; protected Foundry inputs were read and not changed.
- Pinning, DNS/ENS/site naming, CID/asset publication checks and independently attested service outcomes are subsequent control-plane work. No published URL or CID is claimed.

This review applies the pinned Better Interface guidance (Jakub Krehel, MIT) and the pinned Impeccable documentation method (Paul Bakaus, Apache-2.0), with attribution and immutable upstream references recorded in `DESIGN.md`.

## Managed Git limitation

`git add` failed with `Unable to create .../.git/index.lock: Read-only file system`. No protected Git metadata was changed and no permission escalation was attempted. The source, lockfile, static export, manifest and evidence are present under the allowed paths for collection. The final `verify` script includes untracked delivery files in both its path and byte checks. A temporary Git copy provides the commit/bundle size check without claiming that a workspace commit succeeded.

The isolated full-history Git bundle passed `git bundle verify` and remained below 1.5 MiB (limit: 8 MiB). Its temporary commit does not modify the managed workspace HEAD. Temporary bundles, Git metadata, dependency directories and browser binaries are excluded from the delivery paths. `git diff --cached --check` in the isolated copy passed after removing trailing spaces emitted by the browser network logger; request content was preserved.
