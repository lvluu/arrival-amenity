// "Report a problem": sends the description, the processed result and (if allowed) the report PDF to /api/bug.

export interface BugPayload {
  description: string;
  result: unknown; // what the app showed: summary + settings
  pdf: File | null;
}

export async function sendBug(p: BugPayload): Promise<string> {
  const form = new FormData();
  form.set("description", p.description);
  form.set("result", JSON.stringify(p.result));
  form.set("app", BUILD_ID);
  if (p.pdf) form.set("pdf", p.pdf);
  const res = await fetch("/api/bug", { method: "POST", body: form });
  const body: unknown = await res.json().catch(() => ({}));
  const o = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (!res.ok || typeof o.id !== "string") {
    throw new Error(typeof o.error === "string" ? o.error : `server answered ${res.status}`);
  }
  return o.id;
}
