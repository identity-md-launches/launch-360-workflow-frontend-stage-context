import {
  createPublicClient,
  custom,
  defineChain,
  fallback,
  http,
  keccak256,
  stringToHex,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";
export type Provider = EIP1193Provider;
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export type Contract = {
  name: string;
  address: Address;
  abiHash: string;
  abiPath: string;
  abi: Abi;
};
export type Deployment = {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: Omit<Contract, "abi">[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: Record<string, Address>;
  };
};
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return value;
}
export const canonical = (value: unknown) => JSON.stringify(sorted(value));
async function json(path: string) {
  if (path.startsWith("/") || path.includes("..") || path.includes(":"))
    throw Error("Unsafe deployment asset path");
  const response = await fetch(
    new URL(path, new URL("./", window.location.href)),
    { cache: "no-cache" },
  );
  if (!response.ok) throw Error(`Unable to load ${path}. Reload to try again.`);
  return response.json();
}
export async function loadConfig() {
  const manifest: Deployment = await json("imd-deployment.json");
  const n = manifest.network;
  if (
    manifest.version !== 1 ||
    n.chainId !== manifest.chainId ||
    !n.rpcUrls.length ||
    !n.rpcUrls.every((u) => u.startsWith("https://"))
  )
    throw Error("Invalid deployment network");
  const contracts = await Promise.all(
    manifest.contracts.map(async (c) => {
      const abi: Abi = await json(c.abiPath);
      if (
        !Array.isArray(abi) ||
        keccak256(stringToHex(canonical(abi))).slice(2) !== c.abiHash
      )
        throw Error(
          `${c.name} ABI verification failed. Transactions are disabled.`,
        );
      return { ...c, abi };
    }),
  );
  const market = contracts.find((c) => c.name === "ParimutuelMarket");
  const token = contracts.find((c) => c.name === "LaunchToken");
  if (!market || !token || contracts.length !== 2)
    throw Error("Unexpected deployment contract set");
  const chain = defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: {
      default: { name: `${n.name} explorer`, url: n.explorer },
    },
    testnet: n.testnet,
  });
  const walletAddChain = {
    chainId: `0x${n.chainId.toString(16)}`,
    chainName: n.name,
    rpcUrls: n.rpcUrls,
    nativeCurrency: n.nativeCurrency,
    blockExplorerUrls: [n.explorer],
  };
  return { manifest, market, token, chain, walletAddChain };
}
export type Config = Awaited<ReturnType<typeof loadConfig>>;
export function readClient(config: Config, provider?: Provider) {
  return createPublicClient({
    chain: config.chain,
    transport: fallback(
      [
        ...config.manifest.network.rpcUrls.map((url) =>
          http(url, { timeout: 8000, retryCount: 0 }),
        ),
        ...(provider ? [custom(provider, { retryCount: 0 })] : []),
      ],
      { retryCount: 0 },
    ),
  });
}
export type Client = ReturnType<typeof readClient>;
