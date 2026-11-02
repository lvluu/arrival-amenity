import {
  GlobalWorkerOptions,
  getDocument,
  type PageViewport,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

GlobalWorkerOptions.workerSrc = "pdf.worker.min.mjs";

export type { PDFDocumentProxy, PageViewport, TextItem };

export interface Line {
  text: string;
  page: number;
  items: TextItem[];
}

export interface PageImage {
  canvas: HTMLCanvasElement;
  viewport: PageViewport;
}

export type Rect = [x: number, y: number, w: number, h: number];

export function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({ data }).promise;
}

// pdf.js gives positioned text items; rebuild lines by grouping items on the same y.
export async function readLines(pdf: PDFDocumentProxy): Promise<Line[]> {
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

export async function renderPage(pdf: PDFDocumentProxy, n: number, scale: number): Promise<PageImage> {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = Object.assign(document.createElement("canvas"), { width: viewport.width, height: viewport.height });
  await page.render({ canvas, viewport }).promise;
  return { canvas, viewport };
}

// Canvas rectangle around text items, in viewport pixels.
export function box(viewport: PageViewport, items: TextItem[], pad = 3): Rect {
  const pts = items.flatMap((it) => {
    const [x, y] = [it.transform[4], it.transform[5]];
    return [
      viewport.convertToViewportPoint(x, y - 2),
      viewport.convertToViewportPoint(x + it.width, y + Math.abs(it.transform[3])),
    ];
  });
  const xs = pts.map((p) => p[0] as number);
  const ys = pts.map((p) => p[1] as number);
  const [x1, y1] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  return [x1, y1, Math.max(...xs) + pad - x1, Math.max(...ys) + pad - y1];
}
