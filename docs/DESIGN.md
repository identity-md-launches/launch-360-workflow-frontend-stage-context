# Oddsmaker design

## Overview

A compact market board for people trying yes/no prediction markets on Sepolia. The implemented page uses an off-white canvas, charcoal text, restrained lime emphasis, and flat cards. A large question-led introduction establishes the product; the market board and wallet/action panel form the working area. The visual direction is an implementation assumption, not a separately approved brand specification.

Source of truth: `web/src/styles.css`, `web/src/App.tsx`. Design documentation is under `docs/` because the task expressly prohibits root-file changes.

## Colors

All canonical values are hex CSS variables in `styles.css:1`. Components use semantic aliases; neutral, lime and rose primitives are only assigned through the role layer.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Canvas | `--page` | `#f4f5ee` | Entire page |
| Card/input | `--surface` | `#ffffff` | Market, wallet and ticket surfaces |
| Subtle surface | `--surface-muted` | `#e9ebe2` | Notice, disabled actions, neutral badges |
| Primary text | `--text` | `#20291f` | Body, headings, dark action fill |
| Secondary text | `--muted` | `#545f51` | Descriptions, metadata |
| Structural border | `--border` | `#c9cec1` | Cards and separators |
| Control boundary | `--control-border` | `#767e72` | Enabled inputs and buttons |
| Accent fill | `--accent` | `#d1ed79` | Connect wallet, decorative yes card |
| Positive surface | `--accent-soft` | `#eaf1ce` | Open status, selected yes, activity notice |
| Positive text | `--positive` | `#3d521b` | Open badge, pool share |
| Error text | `--negative` | `#853f2c` | Validation and transaction errors |
| Error/no surface | `--negative-soft` | `#f5e5dc` | Alerts and selected no option |
| Keyboard focus | `--focus` | `#354bb2` | 3px outline, 4px offset |

Measured live foreground/background contrasts: body/canvas 13.69:1, secondary/canvas 6.11:1, charcoal/lime 11.51:1, white/charcoal 15.02:1, and notice text/surface 12.48:1. These are the specific rendered pairs measured in `docs/evidence/contrast-live.json`, not a claim about every possible state. The fixture accessibility scan also checks visible text contrast. Status always includes text; colors do not carry the meaning alone. There is no dark theme.

## Typography

Arial, Helvetica, sans-serif is the system stack; there are no downloadable fonts. Body defaults to 16px at 1.5 line height. Headings use weights 600, while brand text uses 700; actual face availability depends on the platform. `font-synthesis: none` is set, with regular and bold emphasis visibly distinct in the tested Chromium/Linux environment. Numeric readouts use tabular figures. Long identifiers wrap rather than being clipped, and full addresses are available through explorer links; wallet address text is fully shown.

- Hero: `clamp(2.55rem, 4.8vw, 4.2rem)`, 1.08 line height, -0.055em tracking; mobile overrides keep the display inside the viewport.
- Section heading: `--text-heading: 1.625rem`, 1.25 line height, -0.04em tracking; 1.45rem on the smallest layout.
- Market/ticket headings: 1.2rem/1.3rem with 1.4 line height.
- Body: `--text-body: 1rem`; supporting UI: `--text-sm: .8125rem`; fields: 1rem at every width.
- Eyebrows: .6875rem, .12em tracking, uppercase via CSS; .625rem below 540px. Secondary metadata goes as small as .625rem in deliberately dense cards, with high contrast.
- Headings balance lines; descriptions use `text-wrap: pretty`. Hero intro is capped at 430px. Changing balances and odds do not jump between proportional numeral widths.

## Layout

`.shell` caps the page at 1296px including 48px horizontal padding. Main spacing steps are 8, 12, 16, 20, 24, 32, 40 and 48px. Groups are separated more generously than their controls. The hero is a two-column arrangement with CSS illustration. The working grid is `minmax(0,1fr) 340px`, with a 32px gutter, and the market board has two columns.

- At 1100px: 32px page padding; main nav hides; action column becomes 320px; board and creation subform switch to one column.
- At 800px: 24px padding, one working column, illustration hidden, two board columns, and wallet/action content follows the board in normal document flow.
- At 540px: 18px padding, one board column and one rules column; header, filters, headings, positions and actions can wrap with enlarged text. The testnet notice uses an icon/text grid so its link cannot squeeze the paragraph.

No sticky/fixed transaction controls or overlays obscure content. Market selection scrolls the action panel into view. Contract and wallet strings wrap. The page was checked at 1440, 1024, 800, 540, 375 and 320 CSS pixels. 200% root text sizing at 320px also passed the overflow assertion. Browser-native zoom and physical-device behavior were not verified.

## Elevation & Depth

The design is deliberately flat. Tonal backgrounds separate sections; 1px borders establish cards and input boundaries. A selected market has a dark border plus a 1px spread shadow, used as an additional selected-state outline. There are no floating modals, drop shadows for decoration, or image backgrounds. The hero's CSS-only cards and orbit lines are decorative and `aria-hidden`.

## Shapes

Cards use 12px radii; the hero's decorative cards use 14px; ordinary buttons use 9px; fields and side options use 8px; status tags use 4px. Compact circular dots supplement status labels. Header and footer reuse the skewed three-bar CSS brand mark. The broad rectangles, spare borders and ample inner padding are the reusable shape language.

## Components

All page patterns live in `App.tsx`; this is a single page, not an exported UI library.

- `Logo`: text plus decorative CSS bars; a real anchor to the top of the page.
- `MarketCard`: one native button for the whole card, with `aria-pressed`, question, textual status, percentage labels, pool, closing date, and selected border. The share bar is decorative because its values are already text.
- `Ticket`: selected market metadata and gated bet, resolve, void or claim controls. Native radio buttons select sides. Approval and betting remain separate numbered steps. Exact amounts are previewed before confirmation.
- `CreateForm`: labeled question, datetime and resolver fields, a UTF-8 byte counter, inline described errors, and focus on the first invalid field. Its parent is a native `details` disclosure. The hero trigger opens it and moves focus to the question.
- Wallet panel: balance, allowance, complete connected address, missing-wallet guidance and wrong-chain recovery. Balance/allowance full precision is available through `title`; truncated display is indicative and transaction parsing retains all decimals.
- `.primary`, `.dark-button`, neutral buttons: lime wallet emphasis, dark consequential actions, neutral secondary actions. Disabled state has native semantics and adjacent prerequisite copy.
- `.error`, `.activity`, `.read-status`: persistent alert, polite transaction status, and current block/read freshness. Read failures disable writes; no transient toast hides required recovery information.

Focus is a 3px solid blue perimeter with 4px offset; forced colors substitute `Highlight`. Inputs stay at least 16px. Ordinary controls target 44px height; compact filter/refresh controls are 40px. The native disclosure and radio/checkbox keyboard semantics are preserved. Motion is restricted to 120ms button background/press feedback and only runs under `prefers-reduced-motion: no-preference`; press scale is 0.96. There is no entrance animation.

## Do's and Don'ts

- Start with `.shell`, `.section-heading`, `.field` and the existing button roles when extending the page. Use native elements and visible labels.
- Keep token values in the role system and update the measured pairs when changing color. Include textual statuses and explain unavailable actions.
- Keep token values in ODMK, dates explicitly localized, and contract values traceable to live reads. Never introduce example markets into production.
- Reuse wrapping grids and minimum heights; do not fix control heights or hide overflowing text to make a screenshot fit.
- A new view should reuse the layout, type and component patterns, have a clear heading, and preserve relative static URLs. Do not add a second deployment/address map or unsupported live swap flow.

Design guidance was adapted from Jakub Krehel's [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, MIT. Documentation method follows Paul Bakaus's [Impeccable reference](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, Apache-2.0. These are separate upstream works retaining their respective licenses. Only the pinned local guidance was consulted; no live upstream guide was substituted.
