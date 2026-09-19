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
All fields must contain an answer (including `No` or `N/A`) before downloading or
copying Markdown responses, or using Print / Save as PDF. Exports include their UTC
date; downloaded filenames include the asset name and date. The print layout
includes full answers across page breaks. Clipboard failures offer downloading
instead. Headings and labels use monospace; answers use system sans-serif, except
contract addresses, which remain monospace.

Token lookup supports Ethereum (1), Arbitrum (42161), Optimism (10), and Fraxtal
(252). Choose a chain and paste a token address, or paste a link from Etherscan,
Arbiscan, Optimistic Etherscan, or Fraxscan to select the chain automatically.
The browser reads ERC-20 `name()` and `symbol()` through each chain's public
PublicNode RPC. These services receive the token address, not contact details or
narrative answers. Requests time out after five seconds; unavailable metadata can
be entered manually. Changing the address or chain clears the previous token's
name and symbol and fills the new token's details, including after restoring a
draft. Contact and narrative answers are preserved. Initial draft restoration,
same-token retries, and edits made while a lookup is loading preserve entered
metadata; “Use found details” can apply that lookup explicitly. Older drafts,
including previously typed chain names, still restore.

Logos come only from CoinGecko's public per-chain token lists and image hosts.
Lists are cached for the current page; missing or failed logos are simply omitted.
No API keys, wallet connection, backend, or additional lookup dependencies are
required. RPC responses and logos are informational and should be reviewed by
the respondent. The lookup code is in `src/lib/token-lookup.mjs` and
`src/scripts/asset-lookup.ts`.

Answers stay in the browser: there is no submission endpoint, upload, analytics,
or external export service. Autosave is always on and writes after a
500 ms typing pause, field changes, and page hiding. Returning in the same browser
restores an incomplete draft. Narrative answer boxes stay quiet while typing.
After the typing pause, a small status below the active box shows “Saving…” during
the local write, then “Saved in this browser.” for two seconds. It clears on the
next edit or on leaving the box. Detail fields and restored drafts save
silently; storage errors stay visible at the top until saving succeeds.
There are no autosave controls. Existing drafts remain compatible.
Browser storage failures are surfaced without blocking editing
or exports.
Private browsing or clearing site data can remove drafts.

The question/field definitions and versioned draft/Markdown helpers live in
`src/lib/asset-intake.mjs`; the browser behavior is in `src/scripts/asset-intake.ts`.
Update the draft version/key if changing the stored field schema. Respondents send
exported files and any supporting material to their yRisk contact on Telegram.

### Testing

`npm test` runs the fast unit suite; `npm run build` also runs these tests before
checking types, content schemas, chart assets, and static generation.
For the full check, install the test browsers once and run:

```sh
npx playwright install chromium webkit
npm run test:all
```

`test:all` builds, then runs the browser suite against that production output on
`127.0.0.1:4322`. `npm run test:browser` can reuse an already current build. It
starts and stops its own server; keep port 4322 available. Tests run in Chromium
and WebKit, use isolated browser contexts, mock RPC/CoinGecko responses, and reject
unexpected external requests. No keys, wallet, or live services are required.

Coverage includes draft corruption and storage failures, autosave timing and
page hiding, required-field validation, clipboard failure, complete Markdown and
print output, narrow layouts, all four networks, cancellation and late results,
manual edits, partial/failed retries, missing logos, and untrusted metadata. PR
checks (including fork PRs) and pushes to `main` run the full suite with read-only
repository permissions. Failed browser checks retain screenshots and traces for
seven days. This workflow does not deploy the site.

Browser tests verify print content and generate a long-answer PDF in Chromium;
visual pagination and the native Save as PDF dialog still need a manual check
when changing print CSS. Live provider availability is checked separately from
the deterministic regression suite.

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
