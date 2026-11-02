# Arrival Fruit

PWA that reads the Opera "Enhanced Pre Arrival Report" PDF and lists the fruit to order per villa:
villa -> room type -> bedrooms -> fruit.

- **Settings** (saved per device): fruit per bedroom, per adult and per villa, plus the room type -> bedrooms table.
  Defaults are assumptions (1 fruit per bedroom; RL3/RP3 = 3, RD2 = 2, others = 1). A code missing from the
  table is guessed from its digit (RP4 = 4, else 1) and flagged "new type".
- Sharer rows are merged per villa. Standby villas (0 nights) are skipped and listed.
- **Phone-first, one screen**: sticky total, one compact row per villa, settings in a bottom sheet.
- **Evidence**: tap a villa to see its PDF rows cut out with red boxes and the fruit math; the "PDF pages" tab shows full pages.
- **Downloads** (top bar): `fruit-order_YYYY-MM-DD.pdf`, a printable A4 order with a tick box per villa, and
  `fruit-evidence_YYYY-MM-DD.pdf`, the same order pages followed by the report with red boxes. Named by arrival day.
  pdf-lib is loaded only when someone downloads.
- **Memory**: settings live in localStorage; the last report lives in IndexedDB (binary, can pass localStorage's
  size limit) and reopens at start. Settings > "Forget this report" removes it.
- The PDF never leaves the device (pdf.js in the browser). The Worker serves static files only.
  Report PDFs hold guest data: `*.pdf` is git-ignored and listed in `public/.assetsignore` so it is never deployed.

## Run

```bash
mise install && mise run install
mise run check    # typecheck + lint + format + bun test
mise run dev      # build, then wrangler dev on http://localhost:8787
mise run deploy   # build, then wrangler deploy
```

`src/` is TypeScript, bundled by `bun build` into `public/app.js` and `public/sw.js`. Those build outputs
are git-ignored. The service worker is network-first, so a new deploy reaches online users on the next load.

## Deploy

Every push to `main` runs `.github/workflows/ci.yml`: check + build, then `wrangler deploy`. Pull requests run the
check only. One-time setup: a Cloudflare API token from the "Edit Cloudflare Workers" template, stored as repo secret
`CLOUDFLARE_API_TOKEN` (`gh secret set CLOUDFLARE_API_TOKEN -R lvluu/arrival-fruit`). The account id is the repo
variable `CLOUDFLARE_ACCOUNT_ID`. `mise run deploy` still works by hand.

