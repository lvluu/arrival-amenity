# Arrival Amenity

PWA that reads the Opera "Enhanced Pre Arrival Report" PDF and lists, per arriving villa, the **bedrooms** and the
**guests** (adults + children). Staff use it to prepare each villa (fruit, amenities) before arrival.

Formerly "Arrival Fruit" and "Beds & Guests". The Worker is now `arrival-amenity` (new workers.dev URL; phones that installed the old
one start with empty settings on the new URL). The on-phone storage keys keep the `arrival-fruit` name.

- **Several days**: a report with more than one "Arrival Date" section shows one button per day; each day has its
  own villa list, totals and downloads. A villa is counted per day (same villa on two days = two lists).
- **Counting**: every row of the same villa number is added up (1010: 0 + 3 + 0 = 3 guests). Rows with 0 guests are
  sharers. A villa whose rows all have 0 guests (sharer-only, standby) is not counted and is listed under the list.
- **Bedrooms** come from the room type table in Settings. A room type the table does not have is added automatically
  with the last number in its code (RP4 = 4, VM1B = 1, none = 1) and marked "New, check" until someone taps OK or
  changes it. Saved per phone (localStorage); bug reports carry the table, so the full list builds up over time.
- **Consecutive booking**: a villa whose comment says "consecutive bookings (06-10 Nov 2026)" shows a flag with the real
  departure (the end of that range) in the Count beds list. The Excel file keeps the row's Dep. Date.
- **Evidence**: tap a villa to see its PDF rows cut out with red boxes (row, room type, adults + children) and the
  math; the "PDF pages" tab shows full pages.
- **Home**: two tiles, "Count beds" and "Excel"; pick one, choose the PDF, and the app opens on that feature.
- **Tabs**: "Count beds" (the villa list above), "PDF pages" and "Excel".
- **Excel**: fills the Arrival sheet of the daily amenity workbook (`public/template.xlsx`, the staff's own sheet with
  every guest cleared) from the report, one file per arrival date named by the date (`06-11-2026.xlsx`); "All days" makes
  them all. Only what the PDF says is filled (room, bedrooms if more than 1, name, adults, children, ETA, dates,
  transfer, AM codes); status, amenity detail and the food and drink sheets stay for staff. The column rules live in
  `COLUMNS` in `src/excel.ts` and are listed in Settings > "Excel columns". A day with more than 17 villas adds rows.
- **Downloads**: `beds-guests_YYYY-MM-DD.pdf` (printable A4 list with a tick box per villa) and
  `beds-guests-evidence_YYYY-MM-DD.pdf` (the list, then the boxed report). On iPhone they open the share sheet.
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

Manual: `mise run deploy` (fetch tags, build, then `wrangler deploy`). CI (`.github/workflows/ci.yml`) runs check + build on every
push and pull request; it does not deploy.

## Versions

`MAJOR.MINOR.PATCH` from git tags (`scripts/version.ts`), shown on the home screen and in Settings > This phone.

- Patch: automatic. Every push to main gets a GitHub release `vX.Y.<commits since vX.Y.0>` with generated notes.
- Minor or major: tag the commit by hand, e.g. `git tag v1.1.0 && git push origin v1.1.0`; patches count from there.
- `1.0.0` = 2026-11-05: Count beds, Excel tab, Microsoft Excel fixes.
