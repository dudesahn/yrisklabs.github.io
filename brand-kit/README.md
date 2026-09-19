# yRisk brand kit

**Status: official yRisk identity. Approved 2026-08-28.**

Surface and chart styling refinements approved 2026-09-07.

Website page backgrounds use warmer ivory (`#F2EFE7`), approved 2026-09-08.
Existing exported brand assets retain their original colors. Chart canvas and plot
backgrounds must be transparent (approved 2026-09-08), so the page supplies the
surface color. Preserve PNG alpha and avoid opaque background fills in SVG.
Raster charts must have at least 3 pixels per CSS display pixel in each dimension.
Keep exported pixel dimensions separate from intended display dimensions using
the generated sidecar, and preserve lossless rendering through image optimization.
Never enlarge a chart to its 3× source dimensions in the page layout.

The yRisk identity sets `yRisk` in SF Mono Regular with subtly tightened tracking.
The identity system uses black (`#090909`), warm paper (`#F5F4F0`), and white
(`#FFFFFF`). Yearn blue (`#0657F9`) is the single accent color. Use it sparingly
for interactive emphasis such as active rules, focus indicators, links, and
text selection. Tonal variations of ink and paper are permitted for secondary
information, fine rules, comparison series and subtle surface separation. They
support hierarchy rather than introducing another signature color. Keep text and
data marks legible against their actual background. Blue is optional; do not add
it merely to make an otherwise complete composition more colorful.

Functional feedback may use muted green (`#356447`) for confirmed success,
amber (`#805D20`) for recoverable warnings, and red (`#A23F3B`) for validation
errors or failed actions. Reserve these colors for short status messages and thin
error borders or rules. Pair them with meaningful text or a symbol; keep ordinary
fields, buttons and backgrounds neutral, with blue for keyboard focus. Do not
color every completed field or add decorative status badges.

Font reference:

- Reference source used to prepare the identity:
  [`supercomputra/SF-Mono-Font`](https://github.com/supercomputra/SF-Mono-Font)
- Source revision: `1409ae79074d204c284507fef9e479248d5367c1`
- Face: `SFMono-Regular.otf`
- Source file SHA-256:
  `41e67c69ee0bb4a364a985fe4da04b76148a906d998f411a0c4fa79cef9eb08e`
- Official terms: [Apple Fonts](https://developer.apple.com/fonts/)

The SF Mono font file is not included. The web stack references a locally
installed SF Mono face and falls back to the platform monospace. Logo glyphs
are outlined in the supplied SVG masters. Brand approval does not replace or
expand Apple's font licence; anyone reproducing or modifying the identity must
confirm that their use is permitted under the current Apple Fonts terms.

## Typography

- **Identity and metadata:** SF Mono Regular
- **Editorial titles:** Newsreader 72pt Regular
- **Interfaces and dense tables:** system sans-serif
- **Website forms and their printed responses:** SF Mono Regular, using the same
  local font and monospace fallback as the surrounding site
- **Numbers:** tabular figures wherever values are compared
- **Chart text:** SF Mono, including titles, axes, labels and annotations

[Newsreader](https://github.com/productiontype/Newsreader) is included under
the SIL Open Font License 1.1. Use it for report titles and short editorial
statements, not dense dashboards.

## Layout rules

- Use black surfaces for avatars, covers, and strong identity moments.
- Use warm paper for reports, research, and long-form reading.
- Keep content left-aligned and allow generous negative space.
- Default to flat surfaces, square editorial geometry and typography-led hierarchy.
  Separate ordinary report sections with whitespace and quiet `1px` rules.
- Permit subtle neutral shadows where elevation clarifies interface structure,
  such as menus, overlays or an occasional raised interactive surface. Keep charts
  and ordinary report sections flat. Use surface separation where a shadow is
  ineffective, particularly on dark backgrounds.
- Small corner radii are permitted on controls. Retain square geometry for editorial
  layouts; do not turn every section into a rounded card.
- Gradients may encode continuous data, such as a heatmap. Decorative gradients,
  glow, gloss and effects on chart marks remain excluded.
- Use monospace for the logo, chart text, labels, dates, addresses and metadata.
- Use sentence case for prose. All caps are limited to small metadata labels.

## Files

| Asset | Use |
| --- | --- |
| `logo/yrisk-wordmark-black.svg` | Official wordmark on light backgrounds |
| `logo/yrisk-wordmark-white.svg` | Official wordmark on dark backgrounds |
| `icons/yrisk-avatar.svg` | Official square avatar |
| `icons/yrisk-favicon.svg` | Official favicon |
| `templates/yrisk-social-card.svg` | Official social card, 1200 × 630 |
| `templates/yrisk-report-cover.svg` | Official editorial report-cover template, 1200 × 1600 |
| `styles/tokens.css` | Portable color, type, spacing, and geometry tokens |
| `exports/yrisk-sf-mono-preview.png` | Contact sheet for visual review |

## Archived directions

The former Iosevka Slab identity and its complete export set are preserved in
[`archive/iosevka-slab/`](archive/iosevka-slab/). Archived assets are retained
for provenance and must not be mixed into new yRisk work.

## Font provenance

- Newsreader revision: `cfcb4f7af0e52c25e8df2a2431814c8e5fe2e155`
- `Newsreader72pt-Regular.ttf` SHA-256:
  `fda3ed5d7dc98387a94eed6a9f1384c9d5929ff1ad6d4851e223ffe119fe95c0`
- Newsreader licence: `fonts/Newsreader-OFL.txt`
