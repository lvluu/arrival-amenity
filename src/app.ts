import { GlobalWorkerOptions, getDocument, type PageViewport, type PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { parseRows, type Row, summarize, type Villa } from "./parse";
import { DEFAULTS, loadSettings, type Settings, sanitize, saveSettings } from "./settings";

GlobalWorkerOptions.workerSrc = "pdf.worker.min.mjs";

const SCALE = 1.5;
const RED = "#e00000";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string | number) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

interface Line {
  text: string;
  page: number;
  items: TextItem[];
}

let doc: PDFDocumentProxy | null = null;
let lines: Line[] = [];
let rows: Row[] = [];
let settings = loadSettings();
let evidenceRun = 0; // only the latest render may replace the evidence

// pdf.js gives positioned text items; rebuild lines by grouping items on the same y.
async function readLines(pdf: PDFDocumentProxy): Promise<Line[]> {
  const out: Line[] = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    const { items } = await (await pdf.getPage(page)).getTextContent();
    const byY: { y: number; items: TextItem[] }[] = [];
    for (const it of items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = it.transform[5];
      const row = byY.find((r) => Math.abs(r.y - y) < 3);
      if (row) row.items.push(it);
      else byY.push({ y, items: [it] });
    }
    for (const r of byY.sort((a, b) => b.y - a.y)) {
      const sorted = [...r.items].sort((a, b) => a.transform[4] - b.transform[4]);
      out.push({ text: sorted.map((i) => i.str.trim()).join(" "), page, items: sorted });
    }
  }
  return out;
}

// Canvas rectangle [x, y, w, h] around text items, in viewport pixels.
function box(viewport: PageViewport, items: TextItem[]): [number, number, number, number] {
  const pts = items.flatMap((it) => {
    const [x, y] = [it.transform[4], it.transform[5]];
    return [
      viewport.convertToViewportPoint(x, y - 2),
      viewport.convertToViewportPoint(x + it.width, y + Math.abs(it.transform[3])),
    ];
  });
  const xs = pts.map((p) => p[0] as number);
  const ys = pts.map((p) => p[1] as number);
  const [x1, y1] = [Math.min(...xs) - 3, Math.min(...ys) - 3];
  return [x1, y1, Math.max(...xs) + 3 - x1, Math.max(...ys) + 3 - y1];
}

function drawVilla(ctx: CanvasRenderingContext2D, viewport: PageViewport, v: Villa, line: Line) {
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2;
  ctx.strokeRect(...box(viewport, line.items));
  const typeItems = line.items.filter((i) => i.str.split(/\s+/).includes(v.roomType));
  if (!typeItems.length) return;
  const [x, y, w, h] = box(viewport, typeItems);
  const label = `${v.room}: ${v.roomType} = ${v.bedrooms} bed${v.bedrooms === 1 ? "" : "s"}, ${v.fruit} fruit`;
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 2, y - 24, ctx.measureText(label).width + 4, 20);
  ctx.fillStyle = RED;
  ctx.fillText(label, x, y - 8);
}

async function renderEvidence(pdf: PDFDocumentProxy, villas: Villa[]) {
  const run = ++evidenceRun;
  const pages = [...new Set(villas.flatMap((v) => v.lines.map((l) => lines[l].page)))].sort((a, b) => a - b);
  const figures: HTMLElement[] = [];
  for (const p of pages) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = Object.assign(document.createElement("canvas"), {
      width: viewport.width,
      height: viewport.height,
      id: `page-${p}`,
    });
    await page.render({ canvas, viewport }).promise;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    for (const v of villas) {
      for (const l of v.lines.filter((l) => lines[l].page === p)) drawVilla(ctx, viewport, v, lines[l]);
    }
    const fig = document.createElement("figure");
    fig.innerHTML = `<figcaption>Page ${p} of ${pdf.numPages}</figcaption>`;
    fig.append(canvas);
    figures.push(fig);
  }
  if (run === evidenceRun) $("evidence").replaceChildren(...figures);
}

function villaRow(v: Villa): string {
  const cls = v.sharerOnly || !v.knownType ? "warn" : "";
  const type = v.knownType ? esc(v.roomType) : `${esc(v.roomType)} <span class="note">new type</span>`;
  return `<tr class="${cls}" data-page="${lines[v.lines[0]].page}"><td><b>${esc(v.room)}</b></td><td>${type}</td>
    <td class="n">${v.bedrooms}</td><td class="n">${v.adults}${v.children ? `+${v.children}` : ""}</td>
    <td class="n"><b>${v.fruit}</b></td><td class="names">${v.names.map(esc).join("<br>")} · ${v.nights}n</td></tr>`;
}

function render() {
  renderSettings();
  if (!doc) return;
  const { villas, standby, totals } = summarize(rows, settings);
  if (!villas.length && !standby.length) {
    $("out").innerHTML = `<p class="note">No guest rows found. Is this the Enhanced Pre Arrival Report?</p>`;
    $("evidence").replaceChildren();
    return;
  }
  const sharer = villas.filter((v) => v.sharerOnly).length;
  const unknown = [...new Set(villas.filter((v) => !v.knownType).map((v) => v.roomType))];
  $("out").innerHTML = `
    <div class="totals">
      <div><b>${totals.villas}</b>villas</div><div><b>${totals.bedrooms}</b>bedrooms</div>
      <div><b>${totals.adults}</b>adults</div><div class="fruit"><b>${totals.fruit}</b>fruit</div>
    </div>
    ${sharer ? `<p class="note">${sharer} villa(s) have only sharer rows (0 rooms): check the main booking.</p>` : ""}
    ${unknown.length ? `<p class="note">New room type(s) ${unknown.map(esc).join(", ")}: bedrooms guessed from the code. Add them in Settings.</p>` : ""}
    <table>
      <thead><tr><th>Villa</th><th>Type</th><th class="n">Beds</th><th class="n">Adl</th><th class="n">Fruit</th><th class="names">Guests</th></tr></thead>
      <tbody>${villas.map(villaRow).join("")}</tbody>
    </table>
    ${standby.length ? `<p class="muted">Skipped standby (0 nights): ${standby.map((v) => `${esc(v.room)} ${esc(v.roomType)}`).join(", ")}</p>` : ""}
    <h2>Evidence</h2><p class="muted">Red box = row counted. Thick box = room type that gives the bedrooms. Tap a villa above to jump to it.</p>`;
  renderEvidence(doc, villas).catch((err: unknown) => {
    $("evidence").textContent = `Could not draw evidence: ${err instanceof Error ? err.message : String(err)}`;
  });
}

function renderSettings() {
  for (const k of ["fruitPerBedroom", "fruitPerAdult", "fruitPerVilla"] as const) {
    const input = $<HTMLInputElement>(k);
    if (document.activeElement !== input) input.value = String(settings[k]);
  }
  const types = Object.entries(settings.roomTypes).sort(([a], [b]) => a.localeCompare(b));
  $("roomTypes").innerHTML = types
    .map(
      ([code, beds]) => `<tr><td><b>${esc(code)}</b></td>
        <td><input type="number" min="0" max="99" value="${beds}" data-code="${esc(code)}" aria-label="Bedrooms for ${esc(code)}"></td>
        <td><button type="button" data-remove="${esc(code)}" aria-label="Remove ${esc(code)}">✕</button></td></tr>`,
    )
    .join("");
}

function update(next: Settings) {
  settings = sanitize(next);
  saveSettings(settings);
  render();
}

for (const k of ["fruitPerBedroom", "fruitPerAdult", "fruitPerVilla"] as const) {
  $(k).addEventListener("change", (e) => update({ ...settings, [k]: Number((e.target as HTMLInputElement).value) }));
}

$("roomTypes").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const code = input.dataset.code;
  if (code) update({ ...settings, roomTypes: { ...settings.roomTypes, [code]: Number(input.value) } });
});

$("roomTypes").addEventListener("click", (e) => {
  const code = (e.target as HTMLElement).dataset.remove;
  if (!code) return;
  const { [code]: _removed, ...rest } = settings.roomTypes;
  update({ ...settings, roomTypes: rest });
});

$("addType").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const code = $<HTMLInputElement>("newCode").value.trim().toUpperCase();
  const beds = Number($<HTMLInputElement>("newBeds").value);
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(code)) return;
  update({ ...settings, roomTypes: { ...settings.roomTypes, [code]: beds } });
  form.reset();
});

$("resetSettings").addEventListener("click", () => update(DEFAULTS));

$("out").addEventListener("click", (e) => {
  const tr = (e.target as HTMLElement).closest<HTMLElement>("tr[data-page]");
  if (tr) document.getElementById(`page-${tr.dataset.page}`)?.scrollIntoView({ behavior: "smooth" });
});

$("file").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  $("status").textContent = `Reading ${file.name}…`;
  try {
    doc = await getDocument({ data: await file.arrayBuffer() }).promise;
    lines = await readLines(doc);
    rows = parseRows(lines.map((l) => l.text));
    $("status").textContent =
      `${file.name}: ${rows.length} guest rows on ${doc.numPages} pages. PDF stays on this device.`;
  } catch (err) {
    doc = null;
    rows = [];
    $("out").replaceChildren();
    $("evidence").replaceChildren();
    $("status").textContent = `Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`;
  }
  render();
});

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
