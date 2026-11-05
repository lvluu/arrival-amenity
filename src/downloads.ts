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

// iPhone: share sheet ("Save to Files", Mail, Zalo...). Elsewhere: normal downloads, one per file.
export async function save(...files: File[]): Promise<void> {
  if (isIOS() && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: files[0]?.name });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed the share sheet
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    Object.assign(document.createElement("a"), { href: url, download: file.name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
