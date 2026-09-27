import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import { readClient, type Config, type Contract } from "./config";
import { errorMessage, type Market } from "./model";
export const PAGE_SIZE = 6n;
export type Snapshot = {
  markets: Market[];
  count: bigint;
  now: bigint;
  block: bigint;
  fetchedAt: number;
  balance: bigint;
  allowance: bigint;
  decimals: number;
  account?: Address;
};
export function useMarkets(config: Config) {
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Snapshot>();
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [tx, setTx] = useState<Hex>();
  const lock = useRef(false);
  const generation = useRef(0);
  const live = useRef({ account, walletChain });
  live.current = { account, walletChain };
  const client = useMemo(
    () => readClient(config, account ? window.ethereum : undefined),
    [config, account],
  );
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true);
    try {
      const chainId = await client.getChainId();
      if (chainId !== config.chain.id)
        throw Error("RPC returned the wrong chain. Transactions are disabled.");
      const block = await client.getBlock();
      const code = await Promise.all(
        [config.market, config.token].map((c) =>
          client.getBytecode({ address: c.address, blockNumber: block.number }),
        ),
      );
      if (code.some((c) => !c || c === "0x"))
        throw Error(
          "Deployed contract code is missing. Transactions are disabled.",
        );
      const read = async <T>(
        c: Contract,
        name: string,
        args: readonly unknown[] = [],
      ) =>
        (await client.readContract({
          address: c.address,
          abi: c.abi,
          functionName: name,
          args,
          blockNumber: block.number,
        })) as T;
      const tokenAddress = await read<Address>(config.market, "token");
      if (tokenAddress.toLowerCase() !== config.token.address.toLowerCase())
        throw Error(
          "Market token differs from the attested ODMK address. Transactions are disabled.",
        );
      // All token reads use the immutable address returned by ParimutuelMarket.token().
      const token = { ...config.token, address: tokenAddress };
      const [count, decimals, symbol, balance, allowance] = await Promise.all([
        read<bigint>(config.market, "marketCount"),
        read<number>(token, "decimals"),
        read<string>(token, "symbol"),
        account ? read<bigint>(token, "balanceOf", [account]) : 0n,
        account
          ? read<bigint>(token, "allowance", [account, config.market.address])
          : 0n,
      ]);
      if (decimals !== 18 || symbol !== "ODMK")
        throw Error("Unexpected token metadata. Transactions are disabled.");
      const start = count - 1n - BigInt(page) * PAGE_SIZE;
      const ids = Array.from(
        {
          length: Number(
            start < 0n ? 0n : start + 1n < PAGE_SIZE ? start + 1n : PAGE_SIZE,
          ),
        },
        (_, i) => start - BigInt(i),
      );
      const markets = await Promise.all(
        ids.map(async (id) => {
          const [market, odds, yesStake, noStake, claimable, claimed] =
            await Promise.all([
              read<
                Omit<
                  Market,
                  | "id"
                  | "yesBps"
                  | "noBps"
                  | "yesStake"
                  | "noStake"
                  | "claimable"
                  | "claimed"
                >
              >(config.market, "market", [id]),
              read<readonly [bigint, bigint]>(config.market, "impliedOdds", [
                id,
              ]),
              account
                ? read<bigint>(config.market, "stakeOf", [id, account, true])
                : 0n,
              account
                ? read<bigint>(config.market, "stakeOf", [id, account, false])
                : 0n,
              account
                ? read<bigint>(config.market, "claimable", [id, account])
                : 0n,
              account
                ? read<boolean>(config.market, "hasClaimed", [id, account])
                : false,
            ]);
          return {
            ...market,
            id,
            yesBps: odds[0],
            noBps: odds[1],
            yesStake,
            noStake,
            claimable,
            claimed,
          };
        }),
      );
      if (id !== generation.current) return;
      setData({
        markets,
        count,
        now: block.timestamp,
        block: block.number,
        fetchedAt: Date.now(),
        balance,
        allowance,
        decimals,
        account,
      });
      setReadError("");
    } catch (e) {
      if (id === generation.current) setReadError(errorMessage(e));
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }, [client, config, account, page]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 20000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const accountsChanged = (accounts: string[]) => {
      generation.current++;
      setData(undefined);
      setAccount(accounts[0] as Address | undefined);
      setError("");
      setNotice("");
    };
    const chainChanged = (id: string) => {
      generation.current++;
      setData(undefined);
      setWalletChain(Number(id));
      void refresh();
    };
    const disconnected = () => {
      generation.current++;
      setAccount(undefined);
      setWalletChain(undefined);
      setData(undefined);
    };
    provider.on("accountsChanged", accountsChanged);
    provider.on("chainChanged", chainChanged);
    provider.on("disconnect", disconnected);
    return () => {
      provider.removeListener("accountsChanged", accountsChanged);
      provider.removeListener("chainChanged", chainChanged);
      provider.removeListener("disconnect", disconnected);
    };
  }, [refresh]);
  const connect = async () => {
    if (!window.ethereum) {
      setError(
        "No browser wallet found. Install an Ethereum wallet, then reload this page.",
      );
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setNotice("Open your wallet to connect.");
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (!accounts[0])
        throw Error(
          "Your wallet did not share an account. Unlock it and try again.",
        );
      const chain = await window.ethereum.request({ method: "eth_chainId" });
      generation.current++;
      setData(undefined);
      setAccount(accounts[0]);
      setWalletChain(Number(chain));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setPending(false);
      setNotice("");
    }
  };
  const switchChain = async () => {
    if (!window.ethereum || lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setNotice("Confirm the network switch in your wallet.");
    try {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: config.walletAddChain.chainId }],
        });
      } catch (e) {
        const err = e as {
          code?: number;
          message?: string;
          data?: { originalError?: { code?: number } };
        };
        if (
          err.code !== 4902 &&
          err.data?.originalError?.code !== 4902 &&
          !/unknown chain|unrecognized chain|not added/i.test(err.message || "")
        )
          throw e;
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [config.walletAddChain],
        });
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: config.walletAddChain.chainId }],
        });
      }
      setWalletChain(
        Number(await window.ethereum.request({ method: "eth_chainId" })),
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setPending(false);
      setNotice("");
    }
  };
  const transact = async (
    contract: Contract,
    functionName: string,
    args: readonly unknown[],
    label: string,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setTx(undefined);
    setNotice(`Checking ${label.toLowerCase()}…`);
    let submitted = false;
    try {
      const provider = window.ethereum;
      if (
        !provider ||
        !account ||
        !data ||
        readError ||
        data.account !== account ||
        Date.now() - data.fetchedAt > 60000
      )
        throw Error(
          "Connect on the correct network and refresh live state before continuing.",
        );
      const expectedAccount = account;
      const checkWallet = async () => {
        const [chain, accounts] = await Promise.all([
          provider.request({ method: "eth_chainId" }),
          provider.request({ method: "eth_accounts" }),
        ]);
        if (
          Number(chain) !== config.chain.id ||
          accounts[0]?.toLowerCase() !== expectedAccount.toLowerCase() ||
          live.current.account !== expectedAccount
        )
          throw Error(
            "Wallet account or network changed. Review the action and try again.",
          );
      };
      await checkWallet();
      if ((await client.getChainId()) !== config.chain.id)
        throw Error("RPC chain verification failed.");
      const { request } = await client.simulateContract({
        address: contract.address,
        abi: contract.abi,
        functionName,
        args,
        account: expectedAccount,
      });
      await checkWallet();
      setNotice(`Confirm ${label.toLowerCase()} in your wallet.`);
      const wallet = createWalletClient({
        chain: config.chain,
        transport: custom(provider),
      });
      const hash = await wallet.writeContract(request);
      submitted = true;
      setTx(hash);
      setNotice(`${label} submitted. Waiting for confirmation…`);
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 120000,
        confirmations: 1,
        onReplaced: (replacement) => setTx(replacement.transaction.hash),
      });
      if (receipt.status !== "success")
        throw Error(
          `${label} reverted on-chain. Review the transaction and refresh before retrying.`,
        );
      setNotice(`${label} confirmed. Updating live state…`);
      if (live.current.account === expectedAccount) await refresh();
      setNotice(`${label} confirmed.`);
    } catch (e) {
      setNotice("");
      setError(
        `${errorMessage(e)}${submitted ? " A transaction was submitted; check its explorer status before retrying." : ""}`,
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  const ready =
    !!account &&
    walletChain === config.chain.id &&
    !!data &&
    data.account === account &&
    !readError &&
    Date.now() - data.fetchedAt < 60000 &&
    !pending;
  return {
    account,
    walletChain,
    page,
    setPage,
    data,
    loading,
    readError,
    error,
    setError,
    notice,
    pending,
    tx,
    ready,
    connect,
    switchChain,
    refresh,
    transact,
  };
}
