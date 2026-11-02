import type { Villa } from "./parse";
import { box, type Line, type PageImage } from "./pdf";

const RED = "#d10000";

const typeItems = (line: Line, roomType: string) => line.items.filter((i) => i.str.split(/\s+/).includes(roomType));

export function label(v: Villa): string {
  return `${v.room}: ${v.roomType} = ${v.bedrooms} bedroom${v.bedrooms === 1 ? "" : "s"}, ${v.fruit} fruit`;
}

// Copy of a clean page with every counted row boxed red and the room type labelled.
export function markPage(src: PageImage, page: number, villas: Villa[], lines: Line[]): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: src.canvas.width,
    height: src.canvas.height,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(src.canvas, 0, 0);
  const s = src.viewport.scale;
  for (const v of villas) {
    for (const l of v.lines.filter((l) => lines[l].page === page)) {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 1.4 * s;
      ctx.strokeRect(...box(src.viewport, lines[l].items));
      const items = typeItems(lines[l], v.roomType);
      if (!items.length) continue;
      const [x, y, w, h] = box(src.viewport, items);
      ctx.lineWidth = 2.6 * s;
      ctx.strokeRect(x, y, w, h);
      const text = label(v);
      ctx.font = `600 ${11 * s}px system-ui, sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 2, y - 15 * s, ctx.measureText(text).width + 6, 13 * s);
      ctx.fillStyle = RED;
      ctx.fillText(text, x + 1, y - 5 * s);
    }
  }
  return canvas;
}

// Proof strip for one guest row, sized for a phone: "room + name" above "dates .. type .. counts".
// Cut from the marked page, so the red boxes come along.
export function cropRow(marked: HTMLCanvasElement, src: PageImage, line: Line, roomType: string): HTMLCanvasElement {
  const s = src.viewport.scale;
  const dateAt = line.items.findIndex((i) => /\d\d\/\d\d\/\d\d/.test(i.str));
  const head = line.items.slice(0, dateAt < 0 ? 2 : dateAt).filter((i) => !/^[CTS]-/.test(i.str.trim()));
  const types = typeItems(line, roomType);
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
