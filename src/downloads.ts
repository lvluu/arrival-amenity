// Order and evidence PDFs. Both are prepared when the download sheet opens, so a tap saves at once;
// iPhone Safari only allows the share sheet right after a tap, and a slow build would lose that.
import type { ExportInput } from "./export";

export type Kind = "order" | "evidence";

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function prepare(input: ExportInput, original: Uint8Array): Record<Kind, Promise<File>> {
  const exporter = import("./export"); // pdf-lib loads only when needed
  const file = async (kind: Kind) => {
    const { evidencePdf, exportName, orderPdf } = await exporter;
    const bytes = kind === "order" ? await orderPdf(input) : await evidencePdf(original, input);
    return new File([bytes as BlobPart], exportName(kind, input.summary), { type: "application/pdf" });
  };
  return { order: file("order"), evidence: file("evidence") };
}

// iPhone: share sheet ("Save to Files", Mail, Zalo...). Elsewhere: a normal download.
export async function save(file: File): Promise<void> {
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed the share sheet
    }
  }
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement("a"), { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
