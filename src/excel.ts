// Daily amenity Excel: the staff's own workbook (public/template.xlsx, cleared copy of their sheet) with the
// "Arrival" sheet filled from the report, one file per arrival date ("5th.xlsx"). Only what the PDF says is filled;
// columns that need asking around (status, amenity detail, food and drink requests) stay empty for staff.
// COLUMNS is shown in Settings, so the rules staff read are the rules the code runs.
import type { Workbook } from "exceljs";
import { mainLine, type Row, type Summary, type Villa } from "./parse";

export const COLUMNS: [col: string, header: string, rule: string][] = [
  ["A", "BTB", "Empty, staff fill"],
  ["B", "ROOM", "Room number; bedrooms on a second line when more than 1 (room type table)"],
  ["C", "ROOM MOVE", "Empty: write the new villa if the guest moved"],
  ["D", "GUEST NAME", "Name on the booking row with guests, * kept"],
  ["E", "NO OF GUEST", "Adults, all rows of the villa added up"],
  ["F", "KID", "Children, empty when 0"],
  ["G", "ARR TIME", 'ETA; 14:59 (no ETA in Opera) becomes "no time"'],
  ["H", "ARR DATE", "Arrival date"],
  ["I", "DEPT DATE", "Departure date"],
  ["J", "REMARK", '"own transfer" or "TA transfer" from the transfer column, else empty'],
  ["K", "STATUS", "Empty, staff fill"],
  ["L", "Code", "AM numbers from Specials and Traces (AM22, AM5 = 22 and 5)"],
  ["M", "AMENITY DETAIL", "Empty, staff fill"],
];
export const OTHER_RULES = [
  "Villas in report order from row 3; more rows are added when a day has more villas.",
  "In-house block (rows 21 to 35): empty, staff fill.",
  "Request food and Request drink sheets: empty template with the date.",
];

export interface ArrivalRow {
  room: string;
  bedrooms: number;
  name: string;
  adults: number;
  children: number;
  eta: string; // "17:30" or "no time"
  arrival: string; // dd/mm/yy
  departure: string;
  remark: string;
  codes: string[];
}

const FIRST = 3; // first villa row in the Arrival sheet
const SLOTS = 17; // template rows 3..19 before the in-house block

// Lines after a guest row up to the next guest row: conf. no., ETA, transfer, specials, traces.
function block(texts: string[], starts: number[], line: number): string[] {
  const end = starts.find((s) => s > line) ?? texts.length;
  return texts.slice(line + 1, end);
}

function arrivalRow(v: Villa, texts: string[], starts: number[], row: Row): ArrivalRow {
  const own = block(texts, starts, row.line);
  const conf = own.find((t) => /^\d{6,8}\s/.test(t)) ?? "";
  const eta = conf.match(/\b(\d\d:\d\d)\b/)?.[1] ?? "";
  const remark = /own transfer/i.test(conf) ? "own transfer" : /TA transfer/i.test(conf) ? "TA transfer" : "";
  const all = v.lines.flatMap((l) => block(texts, starts, l)).join(" ");
  const codes = [...new Set([...all.matchAll(/\bAM(\d+)\b/g)].map((m) => m[1]))];
  return {
    room: v.room,
    bedrooms: v.bedrooms,
    name: (texts[row.line].match(/^\d+\s+(\*?)/)?.[1] ?? "") + row.name,
    adults: v.adults,
    children: v.children,
    eta: eta === "14:59" || !eta ? "no time" : eta,
    arrival: row.arrival,
    departure: row.departure,
    remark,
    codes,
  };
}

// One Arrival row per counted villa of the day. `rows` and `texts` are the whole report, to find each block's end.
export function arrivalRows(summary: Summary, rows: Row[], texts: string[]): ArrivalRow[] {
  const starts = rows.map((r) => r.line);
  return summary.villas.map((v) => {
    const main = mainLine(v);
    const row = rows.find((r) => r.line === main) as Row;
    return arrivalRow(v, texts, starts, row);
  });
}

// dd/mm/yy -> UTC midnight: Excel dates have no time zone, a local midnight would shift a day east of UTC.
const excelDate = (s: string) => {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(Date.UTC(2000 + y, m - 1, d));
};
const excelTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) / 1440;
};

// "05/11/26" -> "5th.xlsx", the staff's own naming.
export function xlsxName(day: string): string {
  const n = Number(day.slice(0, 2));
  const th = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${th}.xlsx`;
}

export async function arrivalXlsx(template: ArrayBuffer, day: string, list: ArrivalRow[]): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const wb: Workbook = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  const date = excelDate(day);
  for (const [sheet, cell] of [
    ["Arrival", "B1"],
    ["Request food", "E1"],
    ["Request drink", "E1"],
  ]) {
    const ws = wb.getWorksheet(sheet);
    if (ws) ws.getCell(cell).value = date;
  }
  const ws = wb.getWorksheet("Arrival");
  if (!ws) throw new Error("template has no Arrival sheet");
  if (list.length > SLOTS) ws.duplicateRow(FIRST + SLOTS - 1, list.length - SLOTS, true);
  list.forEach((a, i) => {
    const r = ws.getRow(FIRST + i);
    r.getCell("B").value = a.bedrooms > 1 ? `${a.room}\n${a.bedrooms}` : Number(a.room);
    r.getCell("D").value = a.name;
    r.getCell("E").value = a.adults;
    r.getCell("F").value = a.children || null;
    r.getCell("G").value = a.eta === "no time" ? a.eta : excelTime(a.eta);
    r.getCell("H").value = excelDate(a.arrival);
    r.getCell("I").value = excelDate(a.departure);
    r.getCell("J").value = a.remark || null;
    r.getCell("L").value = a.codes.length === 1 ? Number(a.codes[0]) : a.codes.join("\n") || null;
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
