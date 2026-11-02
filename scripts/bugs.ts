// Bug reports sent from the app (stored in KV by src/worker.ts).
//   mise run bugs            list reports, newest first
//   mise run bugs -- <id>    download one into bugs/<id>/ (report.json + report.pdf); bugs/ is git-ignored
import { mkdir } from "node:fs/promises";
import { $ } from "bun";

const id = process.argv[2];

if (!id) {
  const keys: { name: string; metadata?: { description?: string; pdf?: boolean } }[] = JSON.parse(
    await $`bunx wrangler kv key list --binding BUGS --remote`.quiet().text(),
  );
  const reports = keys.filter((k) => k.name.endsWith(":report.json")).reverse();
  if (!reports.length) console.log("No bug reports.");
  for (const k of reports) {
    const rid = k.name.split(":")[1];
    console.log(`${rid}  ${k.metadata?.pdf ? "pdf " : "    "} ${k.metadata?.description ?? ""}`);
  }
} else {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Bad report id: ${id}`);
  const dir = `bugs/${id}`;
  await mkdir(dir, { recursive: true });
  for (const file of ["report.json", "report.pdf"]) {
    const out = await $`bunx wrangler kv key get ${`bug:${id}:${file}`} --binding BUGS --remote`.quiet().nothrow();
    if (out.exitCode === 0 && out.stdout.length) await Bun.write(`${dir}/${file}`, out.stdout);
  }
  console.log(`Saved to ${dir}/`);
}
