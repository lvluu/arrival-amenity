import { parseRows, summarize } from "./parse.js";

const pdfjs = window.pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const SCALE = 1.5;
const RED = "#e00000";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let doc = null;
let lines = []; // { text, page, items }
let rows = [];

try { $("perBed").value = localStorage.getItem("perBed") ?? "1"; } catch {}

// pdf.js gives positioned text items; rebuild lines by grouping items on the same y.
async function readLines(pdf) {
  const out = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    const { items } = await (await pdf.getPage(page)).getTextContent();
    const byY = [];
    for (const it of items.filter((i) => i.str.trim())) {
      const y = it.transform[5];
      const row = byY.find((r) => Math.abs(r.y - y) < 3);
      if (row) row.items.push(it); else byY.push({ y, items: [it] });
    }
    byY.sort((a, b) => b.y - a.y);
    for (const r of byY) {
      const sorted = [...r.items].sort((a, b) => a.transform[4] - b.transform[4]);
      out.push({ text: sorted.map((i) => i.str.trim()).join(" "), page, items: sorted });
    }
  }
  return out;
}

// Canvas rectangle [x, y, w, h] around text items, in viewport pixels.
function box(viewport, items) {
  const rects = items.map((it) => viewport.convertToViewportRectangle([it.transform[4], it.transform[5] - 2, it.transform[4] + it.width, it.transform[5] + Math.abs(it.transform[3])]));
  const xs = rects.flatMap((r) => [r[0], r[2]]);
  const ys = rects.flatMap((r) => [r[1], r[3]]);
  const [x1, y1] = [Math.min(...xs) - 3, Math.min(...ys) - 3];
  return [x1, y1, Math.max(...xs) + 3 - x1, Math.max(...ys) + 3 - y1];
}

async function renderEvidence(villas) {
  const pages = [...new Set(villas.flatMap((v) => v.lines.map((l) => lines[l].page)))].sort((a, b) => a - b);
  const wrap = $("evidence");
  wrap.innerHTML = "";
  for (const p of pages) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = Object.assign(document.createElement("canvas"), { width: viewport.width, height: viewport.height, id: `page-${p}` });
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    for (const v of villas) {
      for (const l of v.lines.filter((l) => lines[l].page === p)) {
        const { items } = lines[l];
        ctx.strokeStyle = RED;
        ctx.lineWidth = 2;
        ctx.strokeRect(...box(viewport, items));
        const typeItems = items.filter((i) => i.str.split(/\s+/).includes(v.roomType));
        if (!typeItems.length) continue;
        const [x, y, w, h] = box(viewport, typeItems);
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);
        const label = `${v.room}: ${v.roomType} = ${v.bedrooms} bed${v.bedrooms > 1 ? "s" : ""}, ${v.fruit} fruit`;
        ctx.font = "bold 18px system-ui, sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - 2, y - 24, ctx.measureText(label).width + 4, 20);
        ctx.fillStyle = RED;
        ctx.fillText(label, x, y - 8);
      }
    }
    const fig = document.createElement("figure");
    fig.innerHTML = `<figcaption>Page ${p} of ${doc.numPages}</figcaption>`;
    fig.append(canvas);
    wrap.append(fig);
  }
}

function render() {
  const per = Number($("perBed").value) || 0;
  const { villas, standby, totals } = summarize(rows, per);
  if (!villas.length && !standby.length) {
    $("out").innerHTML = doc ? `<p class="note">No guest rows found. Is this the Enhanced Pre Arrival Report?</p>` : "";
    $("evidence").innerHTML = "";
    return;
  }
  const warn = villas.filter((v) => v.sharerOnly).length;
  $("out").innerHTML = `
    <div class="totals">
      <div><b>${totals.villas}</b>villas</div>
      <div><b>${totals.bedrooms}</b>bedrooms</div>
      <div><b>${totals.adults}</b>adults</div>
      <div class="fruit"><b>${totals.fruit}</b>fruit</div>
    </div>
    ${warn ? `<p class="note">${warn} villa(s) have only sharer rows (0 rooms): check the main booking.</p>` : ""}
    <table>
      <thead><tr><th>Villa</th><th>Type</th><th class="n">Beds</th><th class="n">Adl</th><th class="n">Fruit</th><th class="names">Guests</th></tr></thead>
      <tbody>${villas.map((v) => `
        <tr class="${v.sharerOnly ? "warn" : ""}" data-page="${lines[v.lines[0]].page}"><td><b>${esc(v.room)}</b></td><td>${esc(v.roomType)}</td><td class="n">${v.bedrooms}</td><td class="n">${v.adults}${v.children ? "+" + v.children : ""}</td><td class="n"><b>${v.fruit}</b></td><td class="names">${v.names.map(esc).join("<br>")} · ${v.nights}n</td></tr>`).join("")}
      </tbody>
    </table>
    ${standby.length ? `<p class="muted">Skipped standby (0 nights): ${standby.map((v) => `${esc(v.room)} ${esc(v.roomType)}`).join(", ")}</p>` : ""}
    <h2>Evidence</h2><p class="muted">Red box = row counted. Thick box = room type that gives the bedrooms. Tap a villa above to jump to it.</p>`;
  renderEvidence(villas).catch((err) => { $("evidence").textContent = `Could not draw evidence: ${err.message}`; });
}

$("out").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-page]");
  if (tr) $(`page-${tr.dataset.page}`)?.scrollIntoView({ behavior: "smooth" });
});

$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("status").textContent = `Reading ${file.name}…`;
  try {
    doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    lines = await readLines(doc);
    rows = parseRows(lines.map((l) => l.text));
    $("status").textContent = `${file.name}: ${rows.length} guest rows on ${doc.numPages} pages. PDF stays on this device.`;
  } catch (err) {
    doc = null;
    rows = [];
    $("status").textContent = `Could not read ${file.name}: ${err.message}`;
  }
  render();
});

$("perBed").addEventListener("input", () => {
  try { localStorage.setItem("perBed", $("perBed").value); } catch {}
  render();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
