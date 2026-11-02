# Arrival Fruit

PWA that reads the Opera "Enhanced Pre Arrival Report" PDF and lists, per arriving villa, the **bedrooms** and the
**guests** (adults + children) for the fruit order.

- **Counting**: every row of the same villa number is added up (1010: 0 + 3 + 0 = 3 guests). Rows with 0 guests are
  sharers. A villa whose rows all have 0 guests (sharer-only, standby) is not counted and is listed under the list.
- **Bedrooms** come from the room type table in Settings. A room type the table does not have is added automatically
  with the last number in its code (RP4 = 4, VM1B = 1, none = 1) and marked "New, check" until someone taps OK or
  changes it. Saved per phone (localStorage); bug reports carry the table, so the full list builds up over time.
- **Evidence**: tap a villa to see its PDF rows cut out with red boxes (row, room type, adults + children) and the
  math; the "PDF pages" tab shows full pages.
- **Downloads**: `fruit-order_YYYY-MM-DD.pdf` (printable A4 list with a tick box per villa) and
  `fruit-evidence_YYYY-MM-DD.pdf` (the list, then the boxed report). On iPhone they open the share sheet.
- **Memory**: the last report is kept in IndexedDB and reopens at start; Settings > "Forget this report" removes it.
- **Updates**: every build stamps a new `BUILD_ID` into `sw.js`, so phones notice a deploy and show "A new version is
  ready. Update".
- **Report a problem**: sends the description, what the app showed and (if ticked) the PDF to `POST /api/bug`. The
  Worker stores them in KV for 90 days; read them with `mise run bugs` and `mise run bugs -- <id>`.
- The PDF is parsed on the phone (pdf.js legacy build, for older iPhones). Only a bug report uploads anything.
  Report PDFs are git-ignored and listed in `public/.assetsignore` so they are never deployed.

## Run

```bash
mise install && mise run install
mise run check    # typecheck + lint + format + bun test
mise run dev      # build, then wrangler dev on http://localhost:8787
mise run deploy   # build, then wrangler deploy
```

`src/` is TypeScript, bundled by `scripts/build.ts` into `public/` (build outputs are git-ignored); `src/worker.ts`
is the Worker (bundled by wrangler). iPhone check in WebKit: `bun scripts/iphone-smoke.ts <report.pdf> [url]`
(needs `bunx playwright-core install webkit` once).

## Deploy

Manual: `mise run deploy` (build, then `wrangler deploy`). CI (`.github/workflows/ci.yml`) runs check + build on every
push and pull request; it does not deploy.
