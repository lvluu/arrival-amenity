# Arrival Fruit

PWA that reads the Opera "Enhanced Pre Arrival Report" PDF and lists the fruit to order per villa:
villa -> room type -> bedrooms -> fruit.

- **Settings** (saved per device): fruit per bedroom, per adult and per villa, plus the room type -> bedrooms table.
  Defaults are assumptions (1 fruit per bedroom; RL3/RP3 = 3, RD2 = 2, others = 1). A code missing from the
  table is guessed from its digit (RP4 = 4, else 1) and flagged "new type".
- Sharer rows are merged per villa. Standby villas (0 nights) are skipped and listed.
- **Evidence**: every counted row is boxed red on the rendered PDF page, with the room type and the result.
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
