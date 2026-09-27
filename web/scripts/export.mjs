import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { keccak256, toHex } from "viem";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const handoff = JSON.parse(
  await readFile(root + "web/deployment/handoff.json", "utf8"),
);
const { network, walletAddChain } = JSON.parse(
  await readFile(root + "web/deployment/network.json", "utf8"),
);
export const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sort(value[k])]),
    );
  return value;
}
const derivedWallet = {
  chainId: toHex(network.chainId),
  chainName: network.name,
  rpcUrls: network.rpcUrls,
  nativeCurrency: network.nativeCurrency,
  blockExplorerUrls: [network.explorer],
};
if (
  canonical(derivedWallet) !== canonical(walletAddChain) ||
  network.chainId !== handoff.chainId
)
  throw Error("Network handoff mismatch");
await mkdir(root + "dist/abi", { recursive: true });
const contracts = [];
for (const c of handoff.contracts) {
  if (!/^[A-Za-z0-9_]+$/.test(c.name)) throw Error("Invalid contract name");
  const abiPath = `abi/${c.name}.json`;
  const bytes = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:docs/${abiPath}`],
    { cwd: root },
  );
  const abi = JSON.parse(bytes);
  const hash = keccak256(toHex(canonical(abi))).slice(2);
  if (!Array.isArray(abi) || hash !== c.abiHash)
    throw Error(`ABI binding failed: ${c.name}, ${hash}`);
  await writeFile(root + "dist/" + abiPath, bytes);
  contracts.push({
    name: c.name,
    address: c.address,
    abiHash: c.abiHash,
    abiPath,
  });
  console.log(`Verified pinned ABI ${c.name}: ${hash}`);
}
async function files(dir, prefix = "") {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error("Export must not contain symlinks");
    if (entry.isDirectory())
      result.push(...(await files(dir + "/" + entry.name, path + "/")));
    else if (path !== "imd-deployment.json") result.push(path);
  }
  return result.sort();
}
const assets = [];
let size = 0;
for (const path of await files(root + "dist")) {
  const bytes = await readFile(root + "dist/" + path);
  if ((await stat(root + "dist/" + path)).size > 8388608)
    throw Error("Asset exceeds budget");
  size += bytes.length;
  assets.push({
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
if (assets.length > 128 || size > 8 * 1024 * 1024)
  throw Error("Export exceeds project budget");
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  network,
};
await writeFile(
  root + "dist/imd-deployment.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Manifest written after export: ${assets.length} assets, ${size} bytes (excluding manifest).`,
);
