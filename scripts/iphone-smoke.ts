// iPhone check in WebKit (Safari's engine): open a report, read the totals, open a villa's proof, download the order.
//   mise run dev            (Worker on http://localhost:8787), then:
//   bun scripts/iphone-smoke.ts <report.pdf> [url]
// Needs the Playwright WebKit build that matches playwright-core (`bunx playwright-core install webkit`).
import { devices, webkit } from "playwright-core";

const [pdf, url = "http://127.0.0.1:8787"] = process.argv.slice(2);
if (!pdf) throw new Error("usage: bun scripts/iphone-smoke.ts <report.pdf> [url]");

const browser = await webkit.launch();
try {
  const context = await browser.newContext({ ...devices["iPhone 13"], acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator("#empty input[type=file]").setInputFiles(pdf);
  await page.locator("#result").waitFor({ state: "visible", timeout: 30_000 });
  const totals = {
    villas: await page.locator("#tVillas").textContent(),
    bedrooms: await page.locator("#tBeds").textContent(),
    guests: await page.locator("#tGuests").textContent(),
  };
  const first = page.locator("#list details").first();
  await first.locator("summary").click();
  await first.locator(".strip canvas").first().waitFor({ timeout: 15_000 });
  const why = await first.locator(".why").textContent();
  await page.locator("#downloadBtn").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-download=order]").click()]);
  await page.screenshot({ path: "bugs/iphone-smoke.png" });
  console.log(JSON.stringify({ totals, why, download: download.suggestedFilename(), errors }, null, 2));
  if (errors.length) process.exit(1);
} finally {
  await browser.close();
}
