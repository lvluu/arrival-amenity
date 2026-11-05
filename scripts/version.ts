// App version from git tags: the newest vX.Y.0 tag gives major.minor, the commits on top of it give the patch.
// Every merge to main is a patch release (CI tags it); bump minor or major by pushing a new vX.Y.0 tag by hand.
// Prints the version when run directly (CI release job), so build and release agree on one number.
import { $ } from "bun";

export async function appVersion(): Promise<string> {
  const base = (await $`git describe --tags --match "v*.*.0" --abbrev=0`.quiet().nothrow().text()).trim();
  if (!base) return "dev"; // no tags: shallow clone or tags not fetched
  const patch = (await $`git rev-list --count ${base}..HEAD`.quiet().text()).trim();
  return `${base.slice(1, -2)}.${patch}`;
}

if (import.meta.main) console.log(await appVersion());
