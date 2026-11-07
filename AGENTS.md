# Agent rules

Read `README.md` and `PRODUCT.md` first. Gate: `mise run check`.

## Excel tab (`src/excel.ts`, `public/template.xlsx`)

- A change to the generated xlsx or the template is checked with the `xlsx-validate` skill against the staff original
  (a real Excel-saved day file, not in git; it has guest names): the generated file must give 0 errors. LibreOffice or
  the iPhone preview opening it proves nothing; Microsoft Excel 2024 is stricter.
- Every column rule lives in `COLUMNS`/`OTHER_RULES`, which Settings shows. No hidden mapping logic.
- Never commit report PDFs or filled xlsx files: they hold guest names.

## Deploy

After a PR merges to main, deploy it yourself, no asking: `git fetch origin && git switch --detach origin/main && mise run deploy`,
then `curl -s -o /dev/null -w '%{http_code}' https://arrival-amenity.chickeninkitchen.workers.dev/` must print 200.
