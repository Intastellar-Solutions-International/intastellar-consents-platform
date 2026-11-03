# Design tokens (CMP dashboard)

Source of truth: `src/styles/tokens.css` (CSS custom properties).
`tailwind.config.js` maps its whole theme onto those variables — Tailwind
classes (prefixed `tw-`) and plain CSS (`var(--…)`) always agree.

Tailwind runs with **preflight off** and the **`tw-` prefix**: existing class
names in this codebase (`hidden`, `sticky`, `container`, `flex` …) never pick
up Tailwind rules, and no global reset changes existing pages.

## Rules
- **Gold (`accent`) is only for primary actions and the active state.** Not
  for framing cards, tags or panels. Gold *text* uses `accent-strong`.
- **Risk levels** (high/medium/low → danger/warning/success) are always paired
  with an icon or a text label — never colour alone.
- **Minimum text size 13px** (`--text-xs`).
- Semantic `danger` / `info` base colours are for icons, borders and fills;
  use `danger-text` / `info-text` for text.

## Contrast (WCAG 2.x, measured)

| Token | on bg-sunken #222 | on bg-base #373737 | on bg-raised #3f3f3f |
|---|---|---|---|
| text-primary #f0f0f0 | 13.96 | 10.45 | 9.24 |
| text-secondary #c5c5c5 | 9.22 | 6.90 | 6.10 |
| text-muted #adadad | 7.09 | 5.30 | 4.69 |
| accent-strong #d4b674 (gold text) | 8.14 | 6.09 | 5.39 |
| success #4ade80 | 9.13 | 6.83 | 6.04 |
| warning #f9bf40 | 9.51 | 7.12 | 6.30 |
| danger-text #fca5a5 | 8.38 | 6.27 | 5.55 |
| info-text #93c5fd | 8.82 | 6.60 | 5.84 |
| danger #f87171 (non-text, needs 3:1) | 5.75 | 4.30 | 3.81 |
| info #60a5fa (non-text, needs 3:1) | 6.26 | 4.68 | 4.14 |

Text on gold: text-inverse #1b1b1b on accent #c09f53 = 6.83.

The previous muted grey (#9c9c9c, `--IntastellarMediumGrey`) failed AA on the
base and raised layers (4.34 / 3.84).

## Scales
- Spacing: 4px steps — `--space-1` 4px … `--space-24` 96px, plus `--space-px`
  (1px) and `--space-0-5` (2px) for hairlines.
- Radius: xs 2 · sm 4 · md 8 · lg 12 · xl 16 · 2xl 24 · full.
- Shadows: sm · md · lg · overlay · inset (top highlight) · focus.
- Type: xs 13 · sm 14 · base 16 · lg 18 · xl 20 · 2xl 24 · 3xl 28 · 4xl 32 · 5xl 40.
