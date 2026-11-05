import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const script = join(import.meta.dir, "../scripts/version.ts");
const version = async (dir: string) => (await $`bun ${script}`.cwd(dir).quiet().text()).trim();

test("version is the newest vX.Y.0 tag plus one patch per commit on top", async () => {
  const dir = await mkdtemp(join(tmpdir(), "version-"));
  const git = (...args: string[]) => $`git -c user.name=t -c user.email=t@t ${args}`.cwd(dir).quiet();
  await git("init", "-q");
  await git("commit", "-q", "--allow-empty", "-m", "one");
  expect(await version(dir)).toBe("dev"); // no tag yet
  await git("tag", "v1.0.0");
  expect(await version(dir)).toBe("1.0.0");
  await git("commit", "-q", "--allow-empty", "-m", "two");
  await git("tag", "v1.0.1"); // CI release tags do not reset the count
  await git("commit", "-q", "--allow-empty", "-m", "three");
  expect(await version(dir)).toBe("1.0.2");
  await git("tag", "v1.1.0");
  expect(await version(dir)).toBe("1.1.0");
});
