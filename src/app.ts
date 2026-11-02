import { sendBug } from "./bug-report";
import { type Kind, prepare, save } from "./downloads";
import { cropRow, mainLine, markPage, release } from "./evidence";
import { parseRows, type Row, type Summary, summarize, type Villa } from "./parse";
import { type Line, openPdf, type PageImage, type PDFDocumentProxy, readLines, renderPage } from "./pdf";
import { confirm, DEFAULTS, loadSettings, type Settings, sanitize, saveSettings, withDetected } from "./settings";
import { clearReport, loadReport, saveReport } from "./store";
import { watchUpdates } from "./updates";

const SCALE = 2; // sharp crops on phones, within iPhone Safari's canvas memory limit
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string | number) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

let doc: PDFDocumentProxy | null = null;
let original: Uint8Array | null = null; // the report as opened, for exports and bug reports
let fileName = "";
let lines: Line[] = [];
let rows: Row[] = [];
let pages = new Map<number, PageImage>(); // clean renders, one per page with guest rows
const marked = new Map<number, HTMLCanvasElement>(); // red-boxed copies, made when first needed
let summary: Summary = summarize([], DEFAULTS);
let settings = loadSettings();
let files: Record<Kind, Promise<File>> | null = null; // download PDFs for the current result
const openRooms = new Set<string>();

function clearMarked() {
  for (const c of marked.values()) release(c);
  marked.clear();
}

function markedPage(p: number): HTMLCanvasElement | null {
  const src = pages.get(p);
  if (!src) return null;
  const hit = marked.get(p) ?? markPage(src, p, summary.villas, lines);
  marked.set(p, hit);
  return hit;
}

// ---- villas ----

function guestWords(v: Villa): string {
  const kids = v.children ? `, ${plural(v.children, "child", "children")}` : "";
  return `${plural(v.adults, "adult")}${kids}`;
}

function villaItem(v: Villa): string {
  const sum = v.lines.length > 1 ? `, ${v.lines.length} rows: ${v.rowGuests.join(" + ")}` : "";
  const flag = v.checkType ? `<span class="flag">New type: check bedrooms</span>` : "";
  return `<li><details data-room="${esc(v.room)}"${openRooms.has(v.room) ? " open" : ""}>
    <summary>
      <span class="villa"><b>${esc(v.room)}</b><span class="type">${esc(v.roomType)}</span></span>
      <span class="sub">${guestWords(v)}${sum}${flag}</span>
      <span class="num beds"><b>${v.bedrooms}</b><span>bedroom${v.bedrooms === 1 ? "" : "s"}</span></span>
      <span class="num guests"><b>${v.guests}</b><span>guest${v.guests === 1 ? "" : "s"}</span></span>
    </summary>
    <div class="proof"></div>
  </details></li>`;
}

function fillProof(d: HTMLDetailsElement) {
  const v = summary.villas.find((x) => x.room === d.dataset.room);
  const proof = d.querySelector(".proof");
  if (!v || !proof || proof.childElementCount) return;
  const why = document.createElement("p");
  why.className = "why";
  const beds = `${v.roomType} = ${plural(v.bedrooms, "bedroom")}${v.checkType ? " (new type, taken from the code: check it in settings)" : ""}.`;
  const guests =
    v.lines.length > 1
      ? ` Guests: ${v.rowGuests.join(" + ")} = ${v.guests}. Rows with 0 guests are sharers.`
      : ` Guests: ${guestWords(v)}.`;
  why.textContent = beds + guests;
  proof.append(why);
  for (const l of v.lines) {
    const { page } = lines[l];
    const src = pages.get(page);
    const m = markedPage(page);
    if (!src || !m) continue;
    const strip = cropRow(m, src, lines[l], v.roomType);
    strip.setAttribute("role", "img");
    strip.setAttribute("aria-label", `PDF row ${l === mainLine(v) ? "(main booking) " : ""}boxed in red`);
    const link = Object.assign(document.createElement("button"), {
      type: "button",
      className: "page-link",
      textContent: `Page ${page}`,
    });
    link.dataset.page = String(page);
    const fig = document.createElement("div");
    fig.className = "strip";
    fig.append(strip, link);
    proof.append(fig);
  }
}

function renderPages() {
  const figs = [...pages.keys()].map((p) => {
    const fig = document.createElement("figure");
    fig.id = `page-${p}`;
    fig.innerHTML = `<figcaption>Page ${p} of ${doc?.numPages}</figcaption>`;
    const c = markedPage(p);
    if (c) {
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", `Report page ${p} with counted rows boxed in red`);
      fig.append(c);
    }
    return fig;
  });
  $("fullPages").replaceChildren(...figs);
}

function render() {
  const detected = withDetected(
    settings,
    rows.map((r) => r.roomType),
  ); // new room types get a default to check
  if (detected !== settings) {
    settings = detected;
    saveSettings(settings);
  }
  renderSettings();
  if (!doc) return;
  summary = summarize(rows, settings);
  files = null;
  clearMarked();
  for (const id of ["result", "result-head", "downloadBtn", "forgetReport"]) $(id).hidden = false;
  $("empty").hidden = true;
  const t = summary.totals;
  $("tBeds").textContent = String(t.bedrooms);
  $("tGuests").textContent = String(t.guests);
  $("tVillas").textContent = String(t.villas);
  const unknown = [...new Set(summary.villas.filter((v) => v.checkType).map((v) => v.roomType))];
  $("notes").innerHTML = [
    rows.length ? "" : `<p class="flag">No guest rows found. Open the Enhanced Pre Arrival Report.</p>`,
    unknown.length
      ? `<p class="flag">New room type ${unknown.map(esc).join(", ")}: bedrooms taken from the code. <button type="button" class="link" data-open="settings">Check in settings</button></p>`
      : "",
  ].join("");
  $("list").innerHTML = summary.villas.map(villaItem).join("");
  for (const d of $("list").querySelectorAll<HTMLDetailsElement>("details[open]")) fillProof(d);
  $("skipped").textContent = summary.skipped.length
    ? `Not counted (0 guests): ${summary.skipped.map((v) => `${v.room} ${v.roomType}`).join(", ")}`
    : "";
  if (!$("panel-pages").hidden) renderPages();
  else $("fullPages").replaceChildren();
}

function showTab(name: string) {
  for (const t of document.querySelectorAll<HTMLButtonElement>("[role=tab]")) {
    t.setAttribute("aria-selected", String(t.dataset.tab === name));
  }
  $("panel-villas").hidden = name !== "villas";
  $("panel-pages").hidden = name !== "pages";
  if (name === "pages" && !$("fullPages").childElementCount) renderPages(); // big canvases only when asked
}

// ---- settings sheet ----

function typeItem([code, beds]: [string, number]): string {
  const isNew = settings.unconfirmed.includes(code);
  const action = isNew
    ? `<button type="button" class="ok" data-confirm="${esc(code)}" aria-label="${esc(code)} has ${beds} bedrooms: confirm">OK</button>`
    : `<button type="button" class="icon" data-remove="${esc(code)}" aria-label="Remove ${esc(code)}">×</button>`;
  return `<li${isNew ? ` class="new"` : ""}><label><b>${esc(code)}</b>${isNew ? `<span class="badge">New, check</span>` : ""}
    <input type="number" inputmode="numeric" min="0" max="99" value="${beds}" data-code="${esc(code)}" aria-label="Bedrooms in ${esc(code)}"></label>${action}</li>`;
}

function renderSettings() {
  // New types first, so they are the first thing staff see.
  const entries = Object.entries(settings.roomTypes).sort(
    ([a], [b]) =>
      Number(settings.unconfirmed.includes(b)) - Number(settings.unconfirmed.includes(a)) || a.localeCompare(b),
  );
  $("roomTypes").innerHTML = entries.map(typeItem).join("");
  $("version").textContent = `Version ${BUILD_ID}`;
}

function update(next: Settings) {
  settings = sanitize(next);
  saveSettings(settings);
  render();
}

$("roomTypes").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const code = input.dataset.code;
  if (code) update(confirm({ ...settings, roomTypes: { ...settings.roomTypes, [code]: Number(input.value) } }, code));
});
$("roomTypes").addEventListener("click", (e) => {
  const { remove, confirm: ok } = (e.target as HTMLElement).dataset;
  if (ok) update(confirm(settings, ok));
  if (!remove) return;
  const { [remove]: _removed, ...rest } = settings.roomTypes;
  update({ ...settings, roomTypes: rest });
});
function addType() {
  const codeInput = $<HTMLInputElement>("newCode");
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(code)) return codeInput.focus();
  const roomTypes = { ...settings.roomTypes, [code]: Number($<HTMLInputElement>("newBeds").value) };
  update(confirm({ ...settings, roomTypes }, code));
  codeInput.value = "";
}
$("addBtn").addEventListener("click", addType);
$("addType").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault(); // Enter would submit the sheet and close it
  addType();
});
$("resetSettings").addEventListener("click", () => update(DEFAULTS));

// ---- downloads sheet ----

function exportFiles(): Record<Kind, Promise<File>> | null {
  if (!doc || !original) return null;
  files ??= prepare({ fileName, lines, summary }, original);
  return files;
}

$("downloads").addEventListener("click", async (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-download]");
  const kind = button?.dataset.download;
  const ready = exportFiles();
  if (!button || !ready || (kind !== "order" && kind !== "evidence")) return;
  button.setAttribute("aria-busy", "true");
  try {
    await save(await ready[kind]);
    $<HTMLDialogElement>("downloads").close();
  } catch (err) {
    $("downloadError").textContent = `Could not make the PDF: ${message(err)}`;
  } finally {
    button.removeAttribute("aria-busy");
  }
});

// ---- report a problem ----

$("bugSend").addEventListener("click", async () => {
  const text = $<HTMLTextAreaElement>("bugText");
  const status = $("bugStatus");
  if (!text.value.trim()) {
    status.textContent = "Write what is wrong first.";
    return text.focus();
  }
  const withPdf = $<HTMLInputElement>("bugPdf").checked && original;
  const button = $<HTMLButtonElement>("bugSend");
  button.disabled = true;
  status.textContent = "Sending…";
  try {
    const id = await sendBug({
      description: text.value.trim(),
      result: { fileName, summary, settings, page: location.href },
      pdf: withPdf && original ? new File([original as BlobPart], fileName, { type: "application/pdf" }) : null,
    });
    status.textContent = `Sent, thank you. Reference ${id}.`;
    text.value = "";
  } catch (err) {
    status.textContent = `Not sent: ${message(err)}. Check the connection and try again.`;
  } finally {
    button.disabled = false;
  }
});

// ---- events ----

document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const open = t.closest<HTMLElement>("[data-open]")?.dataset.open;
  if (open) {
    for (const d of document.querySelectorAll<HTMLDialogElement>("dialog[open]")) d.close();
    if (open === "downloads") exportFiles(); // start building now, so the tap on a file is quick
    if (open === "report") {
      $("bugStatus").textContent = "";
      $("bugPdfRow").hidden = !original;
    }
    $<HTMLDialogElement>(open).showModal();
  }
  const tab = t.closest<HTMLElement>("[role=tab]")?.dataset.tab;
  if (tab) showTab(tab);
  const page = t.closest<HTMLElement>(".page-link")?.dataset.page;
  if (page) {
    showTab("pages");
    document.getElementById(`page-${page}`)?.scrollIntoView();
  }
});

for (const d of document.querySelectorAll<HTMLDialogElement>("dialog")) {
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close(); // tap on the backdrop
  });
}

$("list").addEventListener(
  "toggle",
  (e) => {
    const d = e.target as HTMLDetailsElement;
    const room = d.dataset.room ?? "";
    if (!d.open) return void openRooms.delete(room);
    openRooms.add(room);
    fillProof(d);
  },
  true,
);

// ---- open / remember a report ----

// Reads a report into the app state. pdf.js takes ownership of the buffer it gets, so it reads a copy.
async function showReport(name: string, bytes: Uint8Array, note: string) {
  $("status").textContent = `Reading ${name}…`;
  try {
    const pdf = await openPdf(bytes.slice().buffer);
    const nextLines = await readLines(pdf);
    const nextRows = parseRows(nextLines.map((l) => l.text));
    const needed = [...new Set(nextRows.map((r) => nextLines[r.line].page))];
    const nextPages = new Map<number, PageImage>();
    for (const p of needed) nextPages.set(p, await renderPage(pdf, p, SCALE)); // one at a time: less peak memory
    for (const img of pages.values()) release(img.canvas);
    [doc, original, fileName, lines, rows, pages] = [pdf, bytes, name, nextLines, nextRows, nextPages];
    openRooms.clear();
    $("source").textContent = `${name}${rows[0] ? `, arrivals ${rows[0].arrival}` : ""}${note}`;
    $("status").textContent = "";
    $("fullPages").replaceChildren();
    showTab("villas");
  } catch (err) {
    $("status").textContent = `Could not read ${name}: ${message(err)}`;
  }
  render();
}

function forgetReport() {
  for (const img of pages.values()) release(img.canvas);
  clearMarked();
  [doc, original, lines, rows, pages, files] = [null, null, [], [], new Map(), null];
  for (const id of ["result", "result-head", "downloadBtn", "forgetReport"]) $(id).hidden = true;
  $("empty").hidden = false;
  $<HTMLDialogElement>("settings").close();
  clearReport().catch(() => {}); // nothing saved, or storage blocked: nothing to forget
}

document.addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.type === "file" ? input.files?.[0] : undefined;
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  input.value = "";
  await showReport(file.name, bytes, "");
  if (!doc) return;
  try {
    await saveReport({ name: file.name, bytes, savedAt: Date.now() });
  } catch {
    $("source").textContent += " (not saved: storage is blocked on this browser)";
  }
});

$("forgetReport").addEventListener("click", forgetReport);

render();
loadReport()
  .then((saved) => {
    if (!saved) return;
    const when = new Date(saved.savedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    return showReport(saved.name, saved.bytes, `. Reopened from this phone, opened ${when}.`);
  })
  .catch(() => {}); // storage blocked or empty: start on the open screen
watchUpdates($("updateBar"), $<HTMLButtonElement>("updateBtn")).catch(() => {}); // no service worker: no offline/updates
