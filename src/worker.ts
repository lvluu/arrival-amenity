// Cloudflare Worker: static assets, plus POST /api/bug to store a bug report in KV.
// Minimal binding types, so the browser code keeps its DOM types (no workers-types clash).
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  BUGS: {
    put(key: string, value: string | ArrayBuffer, opts?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  };
  BUG_LIMIT: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

const MAX_BYTES = 15 * 1024 * 1024;
const KEEP_SECONDS = 90 * 24 * 60 * 60; // reports hold guest data: drop them after 90 days

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function bug(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await env.BUG_LIMIT.limit({ key: ip })).success)
    return json({ error: "Too many reports. Try again in a minute." }, 429);
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) return json({ error: "The report is too big (15 MB limit)." }, 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "The report could not be read." }, 400);
  }
  const description = String(form.get("description") ?? "")
    .trim()
    .slice(0, 5000);
  if (!description) return json({ error: "Describe what is wrong." }, 400);
  const resultText = String(form.get("result") ?? "null").slice(0, 1_000_000);
  let result: unknown;
  try {
    result = JSON.parse(resultText);
  } catch {
    return json({ error: "The result could not be read." }, 400);
  }
  const pdf = form.get("pdf");
  const file = pdf instanceof File && pdf.type === "application/pdf" && pdf.size <= MAX_BYTES ? pdf : null;
  const id = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${crypto.randomUUID().slice(0, 6)}`;
  const report = {
    id,
    receivedAt: new Date().toISOString(),
    description,
    app: String(form.get("app") ?? "").slice(0, 64),
    userAgent: req.headers.get("user-agent") ?? "",
    pdf: file ? { name: file.name, bytes: file.size } : null,
    result,
  };
  const metadata = { description: description.slice(0, 120), pdf: Boolean(file) };
  await env.BUGS.put(`bug:${id}:report.json`, JSON.stringify(report, null, 2), {
    expirationTtl: KEEP_SECONDS,
    metadata,
  });
  if (file) await env.BUGS.put(`bug:${id}:report.pdf`, await file.arrayBuffer(), { expirationTtl: KEEP_SECONDS });
  return json({ id }, 201);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/bug") return bug(req, env);
    if (pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(req);
  },
};
