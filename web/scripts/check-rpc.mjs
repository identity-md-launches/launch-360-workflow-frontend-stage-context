import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
const manifest = JSON.parse(
  await readFile(new URL("../../dist/imd-deployment.json", import.meta.url)),
);
const result = {
  checkedAt: new Date().toISOString(),
  method: "Read-only public RPC; no transactions broadcast",
  endpoints: [],
};
for (const url of manifest.network.rpcUrls) {
  const entry = { url };
  try {
    const client = createPublicClient({
      transport: http(url, { timeout: 12000, retryCount: 0 }),
    });
    entry.chainId = await client.getChainId();
    if (entry.chainId !== manifest.chainId) throw Error("Wrong chain");
    entry.block = (await client.getBlockNumber()).toString();
    entry.contracts = [];
    for (const contract of manifest.contracts) {
      const code = await client.getBytecode({ address: contract.address });
      if (!code || code === "0x") throw Error(`${contract.name}: missing code`);
      entry.contracts.push({
        name: contract.name,
        address: contract.address,
        codeBytes: (code.length - 2) / 2,
      });
    }
    const market = manifest.contracts.find(
      (c) => c.name === "ParimutuelMarket",
    );
    const abi = JSON.parse(
      await readFile(new URL("../../dist/" + market.abiPath, import.meta.url)),
    );
    entry.token = await client.readContract({
      address: market.address,
      abi,
      functionName: "token",
    });
    entry.marketCount = (
      await client.readContract({
        address: market.address,
        abi,
        functionName: "marketCount",
      })
    ).toString();
    if (
      entry.token.toLowerCase() !==
      manifest.contracts
        .find((c) => c.name === "LaunchToken")
        .address.toLowerCase()
    )
      throw Error("Token binding mismatch");
    entry.passed = true;
  } catch (error) {
    entry.passed = false;
    entry.error = error.shortMessage || error.message;
  }
  result.endpoints.push(entry);
  console.log(JSON.stringify(entry));
}
await writeFile(
  new URL("../../docs/evidence/live-rpc.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
if (!result.endpoints.some((e) => e.passed)) process.exitCode = 1;
