import { cropRow, markPage } from "./evidence";
import { parseRows, type Row, summarize, type Villa } from "./parse";
import { type Line, openPdf, type PageImage, type PDFDocumentProxy, readLines, renderPage } from "./pdf";
import { DEFAULTS, loadSettings, type Settings, sanitize, saveSettings } from "./settings";

const SCALE = 2.5; // crisp crops on phone screens
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string | number) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let doc: PDFDocumentProxy | null = null;
let lines: Line[] = [];
let rows: Row[] = [];
let pages = new Map<number, PageImage>(); // clean renders, one per page with guest rows
let marked = new Map<number, HTMLCanvasElement>(); // same pages with red boxes for the current settings
let villas: Villa[] = [];
let settings = loadSettings();
const openRooms = new Set<string>();

function villaItem(v: Villa): string {
  const flags = [
    v.sharerOnly ? `<span class="flag">Check booking: sharer only</span>` : "",
    v.knownType ? "" : `<span class="flag">New type: guessed</span>`,
  ].join("");
  const kids = v.children ? `, ${plural(v.children, "child", "children")}` : "";
  return `<li><details data-room="${esc(v.room)}"${openRooms.has(v.room) ? " open" : ""}>
    <summary>
      <span class="villa"><b>${esc(v.room)}</b><span class="type">${esc(v.roomType)}</span></span>
      <span class="sub">${plural(v.bedrooms, "bedroom")}, ${plural(v.adults, "adult")}${kids}, ${plural(v.nights, "night")}${flags}</span>
      <span class="fruit"><b>${v.fruit}</b><span>fruit</span></span>
    </summary>
    <div class="proof"></div>
  </details></li>`;
}

function fillProof(d: HTMLDetailsElement) {
  const v = villas.find((x) => x.room === d.dataset.room);
  const proof = d.querySelector(".proof");
  if (!v || !proof || proof.querySelector("canvas")) return;
  const why = document.createElement("p");
  why.className = "why";
  why.textContent = `${v.roomType} = ${plural(v.bedrooms, "bedroom")}${v.knownType ? "" : " (guessed from the code)"}. ${rule(v)}`;
  proof.prepend(why);
  for (const l of v.lines) {
    const { page } = lines[l];
    const src = pages.get(page);
    const m = marked.get(page);
    if (!src || !m) continue;
    const strip = cropRow(m, src, lines[l], v.roomType);
    strip.setAttribute("role", "img");
    strip.setAttribute("aria-label", `PDF row for ${lines[l].text.slice(0, 60)}, boxed in red`);
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

// The fruit math for one villa, in words, only with the parts that apply.
function rule(v: Villa): string {
  const parts = [
    settings.fruitPerBedroom ? `${v.bedrooms} × ${settings.fruitPerBedroom}` : "",
    settings.fruitPerAdult ? `${v.adults} adults × ${settings.fruitPerAdult}` : "",
    settings.fruitPerVilla ? `${settings.fruitPerVilla} per villa` : "",
  ].filter(Boolean);
  return `${parts.join(" + ") || "0"} = ${plural(v.fruit, "fruit", "fruit")}.`;
}

function renderPages() {
  $("fullPages").replaceChildren(
    ...[...marked].map(([p, c]) => {
      const fig = document.createElement("figure");
      fig.id = `page-${p}`;
      fig.innerHTML = `<figcaption>Page ${p} of ${doc?.numPages}</figcaption>`;
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", `Report page ${p} with counted rows boxed in red`);
      fig.append(c);
      return fig;
    }),
  );
}

function render() {
  renderSettings();
  if (!doc) return;
  const s = summarize(rows, settings);
  villas = s.villas;
  $("empty").hidden = true;
  $("result").hidden = false;
  $("result-head").hidden = false;
  $("tFruit").textContent = String(s.totals.fruit);
  $("tVillas").textContent = String(s.totals.villas);
  $("tBeds").textContent = String(s.totals.bedrooms);
  $("tAdults").textContent = String(s.totals.adults);
  marked = new Map([...pages].map(([p, img]) => [p, markPage(img, p, villas, lines)]));
  const unknown = [...new Set(villas.filter((v) => !v.knownType).map((v) => v.roomType))];
  $("notes").innerHTML = [
    rows.length ? "" : `<p class="flag">No guest rows found. Open the Enhanced Pre Arrival Report.</p>`,
    unknown.length
      ? `<p class="flag">New room type ${unknown.map(esc).join(", ")}: bedrooms guessed. <button type="button" class="link" data-open-settings>Set it in settings</button></p>`
      : "",
  ].join("");
  $("list").innerHTML = villas.map(villaItem).join("");
  for (const d of $("list").querySelectorAll<HTMLDetailsElement>("details[open]")) fillProof(d);
  $("standby").textContent = s.standby.length
    ? `Not counted (standby, 0 nights): ${s.standby.map((v) => `${v.room} ${v.roomType}`).join(", ")}`
    : "";
  renderPages();
}

function showTab(name: string) {
  for (const t of document.querySelectorAll<HTMLButtonElement>("[role=tab]")) {
    t.setAttribute("aria-selected", String(t.dataset.tab === name));
  }
  $("panel-villas").hidden = name !== "villas";
  $("panel-pages").hidden = name !== "pages";
}

// ---- settings sheet ----
const NUMBERS = ["fruitPerBedroom", "fruitPerAdult", "fruitPerVilla"] as const;

function renderSettings() {
  for (const k of NUMBERS) {
    const input = $<HTMLInputElement>(k);
    if (document.activeElement !== input) input.value = String(settings[k]);
  }
  $("roomTypes").innerHTML = Object.entries(settings.roomTypes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([code, beds]) => `<li><label><b>${esc(code)}</b>
        <input type="number" inputmode="numeric" min="0" max="99" value="${beds}" data-code="${esc(code)}" aria-label="Bedrooms in ${esc(code)}"></label>
        <button type="button" class="icon" data-remove="${esc(code)}" aria-label="Remove ${esc(code)}">×</button></li>`,
    )
    .join("");
}

function update(next: Settings) {
  settings = sanitize(next);
  saveSettings(settings);
  render();
}

for (const k of NUMBERS) {
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
function addType() {
  const codeInput = $<HTMLInputElement>("newCode");
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(code)) return codeInput.focus();
  update({ ...settings, roomTypes: { ...settings.roomTypes, [code]: Number($<HTMLInputElement>("newBeds").value) } });
  codeInput.value = "";
}
$("addBtn").addEventListener("click", addType);
$("addType").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault(); // Enter would submit the sheet and close it
  addType();
});
$("resetSettings").addEventListener("click", () => update(DEFAULTS));

// ---- events ----
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("[data-open-settings]")) $<HTMLDialogElement>("settings").showModal();
  const tab = t.closest<HTMLElement>("[role=tab]")?.dataset.tab;
  if (tab) showTab(tab);
  const page = t.closest<HTMLElement>(".page-link")?.dataset.page;
  if (page) {
    showTab("pages");
    document.getElementById(`page-${page}`)?.scrollIntoView();
  }
});

$("settings").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) $<HTMLDialogElement>("settings").close(); // tap on the backdrop
});

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

document.addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.type === "file" ? input.files?.[0] : undefined;
  if (!file) return;
  $("status").textContent = `Reading ${file.name}…`;
  try {
    const pdf = await openPdf(await file.arrayBuffer());
    lines = await readLines(pdf);
    rows = parseRows(lines.map((l) => l.text));
    const needed = [...new Set(rows.map((r) => lines[r.line].page))];
    pages = new Map(await Promise.all(needed.map(async (p) => [p, await renderPage(pdf, p, SCALE)] as const)));
    doc = pdf;
    openRooms.clear();
    $("source").textContent = `${file.name}${rows[0] ? `, arrivals ${rows[0].arrival}` : ""}`;
    $("status").textContent = "";
    showTab("villas");
  } catch (err) {
    $("status").textContent = `Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`;
  }
  input.value = "";
  render();
});

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
