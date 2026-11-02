// Finds the report fields the counts come from inside one guest row: the room type (bedrooms) and the
// adults and children numbers right after it (guests). Items are sorted left to right, as readLines gives them.
import type { Line, TextItem } from "./pdf";

export interface Fields {
  type: TextItem[];
  guests: TextItem[]; // adults, children
}

export function fields(line: Line, roomType: string): Fields {
  const at = line.items.findIndex((i) => i.str.split(/\s+/).includes(roomType));
  if (at < 0) return { type: [], guests: [] };
  const type = [line.items[at]];
  // Separate items in the real report; if a PDF merges "RL3 3 0" into one item, the type box already covers them.
  const guests = /^\S+$/.test(line.items[at].str.trim())
    ? line.items.slice(at + 1, at + 3).filter((i) => /^\d+$/.test(i.str.trim()))
    : [];
  return { type, guests };
}
