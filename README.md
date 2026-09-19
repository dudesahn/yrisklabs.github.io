# yrisklabs.com

The standalone yRisk public site: an about page, human-approved asset reports,
and research. Built with Astro and deployed as static HTML through GitHub Pages.

## Local development

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4321>.

Run `npm run build` before publishing. The command validates Astro components,
TypeScript, and all content-collection schemas before producing `dist/`.

## Publish

Push `main` and the included workflow builds and deploys the site. GitHub Pages
uses Actions, serves `yrisklabs.com`, and enforces HTTPS.

## Content

- Author complete reports in the sibling `asset-reviews` repository, including the
  title, date and header table. Run its `tools/share_report.py REVIEW --target website`
  to copy an explicitly selected report here. The default target shares a gist only.
- Add research to `src/content/research/`.
- Draft reports appear in local development only; production builds exclude them.
  Keep `draft: true` and `reviewedBy: []` until human review is complete.

Report files are generated copies: edit the canonical Markdown, then synchronize.
Only image paths and JSON front matter differ. The front matter (valid YAML) holds
search/listing metadata and publication controls; it does not generate article
content. Existing publication controls and publication dates survive synchronization.
The reports listing displays and sorts by the Markdown table's `Review date`,
read on each build. Missing or invalid review dates fail the build rather than
falling back to an older publication date. Listing excerpts remain in front matter.
The importer derives the plain search title and optional listing logo from the
canonical `Asset Review: [logo] Protocol Token` heading. Title logos stay inline
and scale with the text; no separate logo lookup is needed here.
The USD3 token mark comes from the [official 3Jane app](https://app.3jane.xyz/tokens/usd3.svg),
retrieved 8 September 2026, and is used solely to identify the reviewed asset.
The report route renders the Markdown directly, and shared CSS owns presentation.
Chart PNGs include a generated `.png.json` sidecar with pixel dimensions, intended
CSS dimensions and a SHA-256 hash. Synchronization copies both. The chart image
service preserves the full raster as lossless PNG while emitting the smaller HTML
width/height; responsive CSS can shrink it further. Do not delete sidecars or
replace exports with screenshots. `npm run build` rejects missing/stale metadata,
insufficient resolution and built images lacking explicit display sizes. Before
publishing, inspect charts at desktop and mobile widths with device scale factors
2 and 3, checking actual displayed size, sharp labels and transparency.

Asset reports must remain unpublished until human review is complete. Curve
governance and the eDAO retain approval, signing, deployment, and execution
authority.

## Architecture

The site ships no client-side framework. Astro generates plain HTML, CSS, RSS,
and sitemaps. The asset intake page has a small, page-specific browser script.
Report front matter is schema-validated; layouts and shared metadata remain
small Astro components.

### Asset intake

Share `/asset-intake/` directly with prospective partners. It is omitted from the
navigation and sitemap and marked `noindex`; the URL is still publicly accessible.
The form covers one asset/deployment and preserves the seven intake questions.
All fields must contain an answer (including `No` or `N/A`) before Markdown export
or Print / Save as PDF. The print layout includes full answers across page breaks.

Answers stay in the browser: there is no submission endpoint, upload, analytics,
or external export service. Autosave is always on and writes after a
500 ms typing pause, field changes, and page hiding. Returning in the same browser
restores an incomplete draft. Saving and restoration happen silently, with no
autosave controls. Browser storage failures are surfaced without blocking editing
or exports.
Private browsing or clearing site data can remove drafts.

The question/field definitions and versioned draft/Markdown helpers live in
`src/lib/asset-intake.mjs`; the browser behavior is in `src/scripts/asset-intake.ts`.
Update the draft version/key if changing the stored field schema. Run
`npm run build`, then check mobile layout, draft restoration, missing-field
validation, Markdown downloads, and printing long answers in a browser before
publishing. Respondents send exported files and any supporting material to their
yRisk contact on Telegram.

The shared layout supplies an explicit Open Graph and Twitter image for all pages
using it, including reports and research. `public/yrisk-social.png` is an unchanged
copy of `brand-kit/exports/yrisk-avatar-512.png`; its square, centered mark stays
legible in small link previews. Keep the 512 × 512 metadata aligned with that asset.
Preview images are website metadata and are not added to the canonical articles.

The visual system follows the official SF Mono yRisk direction: black, warm
paper, and quiet rules. The SF Mono font file is not distributed; visitors use
a locally installed face or the platform monospace fallback.

## Workspace and reference material

This remains an independent repository inside the local yRisk workspace. The
canonical [brand kit](brand-kit/README.md) is maintained here. The `/lr-handoff/`
reader uses `src/data/lr-handoff-documents.json` and the documents and attachments
in `public/lr-handoff/`; the obsolete standalone handover app has been removed.
Keep LlamaRisk's source attribution and licensing terms with that archive.
