import { fields } from "./fields";
import { mainLine, type Villa } from "./parse";
import { box, type Line, type PageImage } from "./pdf";

const RED = "#d10000";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function label(v: Villa): string {
  return `${v.room}: ${v.roomType} = ${plural(v.bedrooms, "bedroom")}, ${plural(v.guests, "guest")}`;
}

// The villa's main booking row: the first one with guests. Its room type gives the bedrooms.

// Copy of a clean page: every counted row boxed red; on the main row the room type is boxed thick and labelled.
export function markPage(
  src: PageImage,
  page: number,
  villas: Villa[],
  lines: Line[],
  notes: number[] = [],
): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: src.canvas.width,
    height: src.canvas.height,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(src.canvas, 0, 0);
  const s = src.viewport.scale;
  ctx.strokeStyle = RED;
  for (const v of villas) {
    for (const l of v.lines.filter((l) => lines[l].page === page)) {
      ctx.lineWidth = 1.4 * s;
      ctx.strokeRect(...box(src.viewport, lines[l].items));
      const f = fields(lines[l], v.roomType);
      ctx.lineWidth = 2.6 * s;
      if (f.guests.length) ctx.strokeRect(...box(src.viewport, f.guests)); // adults + children: every row adds up
      if (l !== mainLine(v) || !f.type.length) continue;
      const [x, y, w, h] = box(src.viewport, f.type); // room type: bedrooms, from the main booking row
      ctx.strokeRect(x, y, w, h);
      const text = label(v);
      ctx.font = `600 ${11 * s}px system-ui, sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 2, y - 15 * s, ctx.measureText(text).width + 6, 13 * s);
      ctx.fillStyle = RED;
      ctx.fillText(text, x + 1, y - 5 * s);
    }
  }
  for (const n of notes.filter((n) => lines[n].page === page)) {
    ctx.lineWidth = 2.6 * s;
    const { cx, cy, rx, ry } = ring(src, lines[n]);
    ctx.beginPath(); // a circle (ellipse) round the "consecutive bookings" comment
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvas;
}

// The comment text itself, not the "Res. Comments / Reservation" labels left of it.
const commentItems = (line: Line) => {
  const hit = line.items.filter((i) => /consecutive|party|\(\d/i.test(i.str));
  return hit.length ? hit : line.items;
};

// Ellipse round the comment text, in canvas pixels.
function ring(src: PageImage, line: Line) {
  const s = src.viewport.scale;
  const [x, y, w, h] = box(src.viewport, commentItems(line), 0);
  return { cx: x + w / 2, cy: y + h / 2, rx: (w / 2) * 1.12 + 12 * s, ry: h * 0.5 * 1.5 + 8 * s };
}

// Proof strip for a "consecutive bookings" comment: its line, cut from the marked page with the red circle.
export function cropComment(marked: HTMLCanvasElement, src: PageImage, line: Line): HTMLCanvasElement {
  const s = src.viewport.scale;
  const { cx, cy, rx, ry } = ring(src, line);
  const pad = 4 * s;
  const [x, y, w, h] = [cx - rx - pad, cy - ry - pad, 2 * (rx + pad), 2 * (ry + pad)];
  const out = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(marked, x, y, w, h, 0, 0, w, h);
  return out;
}

// Proof strip for one guest row, sized for a phone: "room + name" above "dates .. type .. adults, children".
// Cut from the marked page, so the red boxes come along.
export function cropRow(marked: HTMLCanvasElement, src: PageImage, line: Line, roomType: string): HTMLCanvasElement {
  const s = src.viewport.scale;
  const dateAt = line.items.findIndex((i) => /\d\d\/\d\d\/\d\d/.test(i.str));
  const head = line.items.slice(0, dateAt < 0 ? 2 : dateAt).filter((i) => !/^[CTS]-/.test(i.str.trim()));
  const types = fields(line, roomType).type;
  const tail = dateAt < 0 ? [] : line.items.slice(dateAt);
  const row = box(src.viewport, line.items);
  const top = row[1] - 2 * s;
  const height = row[3] + 4 * s;
  const slices: [x: number, w: number][] = [];
  const [hx, , hw] = box(src.viewport, head.length ? head : line.items.slice(0, 1), 6 * s);
  slices.push([hx, hw]);
  if (tail.length && types.length) {
    const [tx] = box(src.viewport, tail, 6 * s);
    const [kx, , kw] = box(src.viewport, types);
    slices.push([tx, kx + kw + 80 * s - tx]); // through adults, children, rooms
  }
  const width = Math.max(...slices.map(([, w]) => w));
  const out = Object.assign(document.createElement("canvas"), { width, height: height * slices.length });
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  for (const [i, [x, w]] of slices.entries()) ctx.drawImage(marked, x, top, w, height, 0, i * height, w, height);
  return out;
}

// iOS Safari caps total canvas memory; zero the size to give it back right away.
export function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
