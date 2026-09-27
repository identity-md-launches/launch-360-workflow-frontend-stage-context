import { readFile, readdir, lstat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { keccak256, stringToHex } from "viem";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url));
const json = async (path) => JSON.parse(await readFile(root + path));
const m = await json("dist/imd-deployment.json");
const h = await json("web/deployment/handoff.json");
const n = await json("web/deployment/network.json");
for (const key of [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
])
  assert.equal(m[key], h[key]);
assert.deepEqual(m.network, n.network);
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
assert.equal(m.contracts.length, h.contracts.length);
for (const [i, c] of m.contracts.entries()) {
  for (const key of ["name", "address", "abiHash"])
    assert.equal(c[key], h.contracts[i][key]);
  assert.match(c.abiPath, /^abi\/[A-Za-z0-9_]+\.json$/);
  const bytes = await readFile(root + "dist/" + c.abiPath);
  const pinned = execFileSync(
    "git",
    ["show", `${h.sourceCommit}:docs/abi/${c.name}.json`],
    { cwd: root },
  );
  assert.deepEqual(bytes, pinned);
  assert.equal(
    keccak256(stringToHex(JSON.stringify(sort(JSON.parse(bytes))))).slice(2),
    c.abiHash,
  );
}
async function files(prefix) {
  const result = [];
  for (const item of await readdir(root + prefix, { withFileTypes: true })) {
    const p = `${prefix}/${item.name}`;
    assert(!item.isSymbolicLink());
    if (item.isDirectory()) result.push(...(await files(p)));
    else result.push(p);
  }
  return result;
}
const exported = (await files("dist"))
  .map((p) => p.slice(5))
  .filter((p) => p !== "imd-deployment.json")
  .sort();
assert.deepEqual(m.assets.map((a) => a.path).sort(), exported);
assert(m.assets.length <= 128);
let total = 0;
for (const a of m.assets) {
  assert(
    !a.path.includes("..") && !a.path.startsWith("/") && !a.path.includes(":"),
  );
  const bytes = await readFile(root + "dist/" + a.path);
  total += bytes.length;
  assert(bytes.length <= 8388608);
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
}
assert(total < 32 * 1024 * 1024);
const index = await readFile(root + "dist/index.html", "utf8");
assert(index.includes('src="./assets/') && index.includes('href="./assets/'));
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root })
  .toString()
  .split("\0")
  .filter(Boolean);
let trackedBytes = 0;
for (const path of tracked) {
  assert(
    !/(^|\/)(node_modules|\.npm|\.cache|\.vite|playwright-report|test-results)(\/|$)/.test(
      path,
    ),
    `Generated dependency/cache tracked: ${path}`,
  );
  assert(!/\.tgz$/.test(path), `Unnecessary archive: ${path}`);
  const meta = await lstat(root + path);
  assert(!meta.isSymbolicLink(), `Symlink/submodule: ${path}`);
  trackedBytes += meta.size;
}
const modes = execFileSync("git", ["ls-files", "--stage"], {
  cwd: root,
}).toString();
assert(!modes.split("\n").some((line) => line.startsWith("160000")));
const modified = execFileSync("git", ["diff", "--name-only", h.sourceCommit], {
  cwd: root,
})
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
const added = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root }).toString().trim().split("\n").filter(Boolean);
const changed = [...modified, ...added];
assert(
  changed.every((p) => /^(web|dist|docs)\//.test(p)),
  `Out of scope change: ${changed}`,
);
assert(
  changed
    .filter((p) => p.split("/").some((s) => s.startsWith(".")))
    .every((p) => p === "web/.gitignore"),
);
assert(
  trackedBytes <= 8388608,
  `Submission file bytes exceed bundle allowance: ${trackedBytes}`,
);
const result = {
  checkedAt: new Date().toISOString(),
  assets: m.assets.length,
  exportBytes: total + (await lstat(root + "dist/imd-deployment.json")).size,
  submissionFileBytes: trackedBytes,
  abiHashesVerified: true,
  handoffAndNetworkMatch: true,
  assetHashesVerified: true,
  relativeBase: true,
  changedPathsInScope: true,
  noDependencyDirectoriesOrSubmodulesTracked: true,
};
await writeFile(
  root + "docs/evidence/integrity.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
