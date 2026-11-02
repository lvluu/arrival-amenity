// Bundles the browser code into public/. BUILD_ID changes every build, so sw.js changes on every deploy:
// browsers only notice a new version when sw.js bytes differ, which is what triggers the update prompt.
import { $ } from "bun";

const sha = (await $`git rev-parse --short HEAD`.quiet().nothrow().text()).trim() || "dev";
const id = `${sha}-${Date.now().toString(36)}`;

await $`rm -f public/chunk-*.js`;
const result = await Bun.build({
  entrypoints: ["src/app.ts", "src/sw.ts"],
  outdir: "public",
  target: "browser",
  minify: true,
  splitting: true,
  naming: { chunk: "chunk-[hash].[ext]" },
  define: { BUILD_ID: JSON.stringify(id) },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await $`cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs public/`;
console.log(`built ${id}: ${result.outputs.map((o) => o.path.split("/").pop()).join(", ")}`);
