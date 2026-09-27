import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  stringToHex,
  parseEther,
  toHex,
} from "viem";
const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(await readFile(root + "dist/imd-deployment.json"));
const token = manifest.contracts.find((c) => c.name === "LaunchToken");
const market = manifest.contracts.find((c) => c.name === "ParimutuelMarket");
const tokenAbi = JSON.parse(await readFile(root + "dist/" + token.abiPath));
const marketAbi = JSON.parse(await readFile(root + "dist/" + market.abiPath));
const alice = "0x1111111111111111111111111111111111111111";
const resolver = "0x2222222222222222222222222222222222222222";
const hash = "0x" + "ab".repeat(32);
const zeroHash = "0x" + "00".repeat(32);
const tests = [];
const errors = [];
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith("/preview/") || pathname.includes("..")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const path = pathname.slice("/preview/".length) || "index.html";
    const body = await readFile(root + "dist/" + path);
    res.setHeader(
      "Content-Type",
      path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".json")
            ? "application/json"
            : "text/html",
    );
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const makeMarket = (id, now) => ({
  question: stringToHex(
    ["Rain before Friday?", "Will the launch ship?", "Will the proposal pass?"][
      id
    ] || `Test question ${id}?`,
    { size: 32 },
  ),
  closeTime: now + 7200n,
  resolver,
  yesPool: parseEther("60"),
  noPool: parseEther("40"),
  outcome: 0,
  paidOut: 0n,
});
let sim;
function reset() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  sim = {
    now,
    chain: "0x1",
    account: alice,
    allowance: 0n,
    balance: parseEther("100"),
    markets: [makeMarket(0, now), makeMarket(1, now), makeMarket(2, now)],
    yesStake: 0n,
    noStake: 0n,
    claimable: 0n,
    claimed: false,
    calls: [],
    sent: [],
    rejected: false,
    simulateError: false,
    rpcDown: false,
    codeMissing: false,
    tokenMismatch: false,
    wrongRpc: false,
    switchUnknown: true,
    added: false,
    receiptStatus: "0x1",
  };
}
reset();
function rpc(method, params = []) {
  if (sim.rpcDown) throw Error("Fixture RPC unavailable");
  switch (method) {
    case "eth_chainId":
      return sim.wrongRpc ? "0x1" : toHex(manifest.chainId);
    case "eth_blockNumber":
      return "0x100";
    case "eth_getCode":
      return sim.codeMissing ? "0x" : "0x60006000";
    case "eth_getBlockByNumber":
      return {
        number: "0x100",
        hash,
        parentHash: zeroHash,
        timestamp: toHex(sim.now),
        nonce: "0x0000000000000000",
        difficulty: "0x0",
        gasLimit: "0x1c9c380",
        gasUsed: "0x100",
        miner: alice,
        extraData: "0x",
        baseFeePerGas: "0x1",
        transactions: [],
        receiptsRoot: hash,
        stateRoot: hash,
        transactionsRoot: hash,
        sha3Uncles: hash,
        logsBloom: "0x" + "00".repeat(256),
        size: "0x100",
        uncles: [],
      };
    case "eth_getTransactionReceipt":
      return {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockHash: hash,
        blockNumber: "0x100",
        from: sim.account,
        to: market.address,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x1",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: sim.receiptStatus,
        type: "0x2",
      };
    case "eth_getTransactionByHash":
      return {
        hash,
        blockHash: hash,
        blockNumber: "0x100",
        from: sim.account,
        to: market.address,
        gas: "0x5208",
        gasPrice: "0x1",
        value: "0x0",
        input: "0x",
        nonce: "0x0",
        transactionIndex: "0x0",
        type: "0x0",
        v: "0x1b",
        r: hash,
        s: hash,
      };
    case "eth_call": {
      const isToken =
        params[0].to.toLowerCase() === token.address.toLowerCase();
      const abi = isToken ? tokenAbi : marketAbi;
      const { functionName, args = [] } = decodeFunctionData({
        abi,
        data: params[0].data,
      });
      sim.calls.push({ functionName, args });
      let result;
      switch (functionName) {
        case "token":
          result = sim.tokenMismatch ? resolver : token.address;
          break;
        case "marketCount":
          result = BigInt(sim.markets.length);
          break;
        case "market":
          result = sim.markets[Number(args[0])];
          break;
        case "impliedOdds": {
          const m = sim.markets[Number(args[0])];
          const total = m.yesPool + m.noPool;
          const yes = total ? (m.yesPool * 10000n) / total : 5000n;
          result = [yes, 10000n - yes];
          break;
        }
        case "decimals":
          result = 18;
          break;
        case "symbol":
          result = "ODMK";
          break;
        case "balanceOf":
          result = sim.balance;
          break;
        case "allowance":
          result = sim.allowance;
          break;
        case "stakeOf":
          result = args[2] ? sim.yesStake : sim.noStake;
          break;
        case "claimable":
          result = sim.claimable;
          break;
        case "hasClaimed":
          result = sim.claimed;
          break;
        default:
          if (sim.simulateError)
            throw {
              code: 3,
              message: "execution reverted: MarketClosed",
              data: encodeErrorResult({
                abi: marketAbi,
                errorName: "MarketClosed",
              }),
            };
          result =
            functionName === "approve"
              ? true
              : functionName === "createMarket"
                ? BigInt(sim.markets.length)
                : functionName === "claim"
                  ? sim.claimable
                  : undefined;
      }
      return encodeFunctionResult({ abi, functionName, result });
    }
    default:
      throw Error(`Unhandled RPC: ${method}`);
  }
}
await context.route(
  /https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz)/,
  async (route) => {
    const body = route.request().postDataJSON();
    const run = (request) => {
      try {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: rpc(request.method, request.params),
        };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: e.code || -32000,
            message: e.message,
            ...(e.data ? { data: e.data } : {}),
          },
        };
      }
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(Array.isArray(body) ? body.map(run) : run(body)),
    });
  },
);
await page.exposeFunction(
  "fixtureWalletRequest",
  async ({ method, params = [] }) => {
    sim.calls.push({ functionName: method, args: params });
    switch (method) {
      case "eth_requestAccounts":
        if (sim.rejected)
          return { error: { code: 4001, message: "User rejected request" } };
        return { result: [sim.account] };
      case "eth_accounts":
        return { result: [sim.account] };
      case "eth_chainId":
        return { result: sim.chain };
      case "wallet_addEthereumChain":
        assert.deepEqual(
          params[0],
          JSON.parse(await readFile(root + "web/deployment/network.json"))
            .walletAddChain,
        );
        sim.added = true;
        return { result: null };
      case "wallet_switchEthereumChain":
        if (sim.switchUnknown && !sim.added)
          return { error: { code: 4902, message: "Unknown chain" } };
        sim.chain = params[0].chainId;
        return { result: null };
      case "eth_sendTransaction": {
        if (sim.rejected)
          return { error: { code: 4001, message: "User rejected request" } };
        const transaction = params[0];
        const abi =
          transaction.to.toLowerCase() === token.address.toLowerCase()
            ? tokenAbi
            : marketAbi;
        const decoded = decodeFunctionData({ abi, data: transaction.data });
        assert(
          !transaction.value || transaction.value === "0x0",
          "No application transaction may send ETH",
        );
        sim.sent.push({ ...decoded, to: transaction.to });
        const args = decoded.args || [];
        if (sim.receiptStatus === "0x1") {
          if (decoded.functionName === "approve") {
            assert.equal(args[0].toLowerCase(), market.address.toLowerCase());
            sim.allowance = args[1];
          }
          if (decoded.functionName === "bet") {
            assert(sim.allowance >= args[2]);
            sim.allowance -= args[2];
            sim.balance -= args[2];
            if (args[1]) {
              sim.yesStake += args[2];
              sim.markets[Number(args[0])].yesPool += args[2];
            } else {
              sim.noStake += args[2];
              sim.markets[Number(args[0])].noPool += args[2];
            }
          }
          if (decoded.functionName === "createMarket")
            sim.markets.push({
              ...makeMarket(sim.markets.length, sim.now),
              question: args[0],
              closeTime: args[1],
              resolver: args[2],
            });
          if (decoded.functionName === "resolve") {
            const m = sim.markets[Number(args[0])];
            m.outcome = args[1];
          }
          if (decoded.functionName === "voidMarket")
            sim.markets[Number(args[0])].outcome = 3;
          if (decoded.functionName === "claim") {
            sim.balance += sim.claimable;
            sim.claimable = 0n;
            sim.claimed = true;
          }
        }
        return { result: hash };
      }
      default:
        try {
          return { result: rpc(method, params) };
        } catch (e) {
          return { error: { code: -32000, message: e.message } };
        }
    }
  },
);
await context.addInitScript(() => {
  const handlers = {};
  window.ethereum = {
    request: async (args) => {
      const reply = await window.fixtureWalletRequest(args);
      if (reply.error)
        throw Object.assign(new Error(reply.error.message), reply.error);
      return reply.result;
    },
    on: (event, fn) => {
      (handlers[event] ||= []).push(fn);
    },
    removeListener: (event, fn) => {
      handlers[event] = (handlers[event] || []).filter((x) => x !== fn);
    },
  };
  window.fixtureEmit = (event, value) =>
    (handlers[event] || []).forEach((fn) => fn(value));
});
async function visible(text) {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ timeout: 10000 });
}
async function check(name, fn) {
  await fn();
  tests.push({ name, passed: true });
  console.log("PASS " + name);
}
async function connect() {
  await page
    .getByRole("button", { name: "Connect wallet", exact: false })
    .first()
    .click();
}
async function refresh() {
  await page.getByRole("button", { name: "Refresh", exact: false }).click();
  await page.getByRole("button", { name: "Refresh", exact: false }).waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Refreshing…"),
      ),
  );
}
const button = (name) => page.getByRole("button", { name, exact: false });
try {
  await check(
    "Static gateway subpath, runtime ABIs and disconnected actions",
    async () => {
      await page.goto(url);
      await visible("3 total markets");
      assert(await button("Approve 10 ODMK").isDisabled());
      assert(await button("Place yes bet").isDisabled());
      assert(sim.calls.some((c) => c.functionName === "token"));
    },
  );
  await check(
    "Missing wallet and rejected connection recover visibly",
    async () => {
      await page.evaluate(() => {
        window.savedWallet = window.ethereum;
        delete window.ethereum;
      });
      await connect();
      await visible("No browser wallet found");
      await page.evaluate(() => {
        window.ethereum = window.savedWallet;
      });
      sim.rejected = true;
      await connect();
      await visible("Request rejected");
      sim.rejected = false;
    },
  );
  await check(
    "Wrong chain blocks writes; unknown chain adds exact handed-off network",
    async () => {
      await connect();
      await visible("Wallet is on chain 1");
      assert(await button("Place yes bet").isDisabled());
      await button("Switch to Sepolia").click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.includes("Approve 10 ODMK") && !b.disabled,
        ),
      );
      assert(sim.added);
      assert.equal(sim.chain, toHex(manifest.chainId));
    },
  );
  await check(
    "Amount precision, insufficient balance and approval prerequisites",
    async () => {
      await page.getByLabel("Stake amount").fill("0.0000000000000000001");
      await page.getByLabel("Stake amount").blur();
      await visible("up to 18 decimal");
      assert(await button("Place yes bet").isDisabled());
      await page.getByLabel("Stake amount").fill("101");
      await visible("balance is below");
      assert(await button("Approve 101").isDisabled());
      await page.getByLabel("Stake amount").fill("10");
      assert(await button("Place yes bet").isDisabled());
    },
  );
  await check(
    "Exact ODMK approval confirms before yes bet and updates live position",
    async () => {
      await button("Approve 10 ODMK").click();
      await visible("ODMK approval confirmed");
      assert.equal(
        sim.sent[0].args[0].toLowerCase(),
        market.address.toLowerCase(),
      );
      assert.equal(sim.sent[0].args[1], parseEther("10"));
      await button("Place yes bet").click();
      await visible("Bet confirmed");
      assert.equal(sim.sent[1].functionName, "bet");
      assert.equal(sim.sent[1].args[1], true);
      assert.equal(sim.yesStake, parseEther("10"));
      assert.equal(sim.allowance, 0n);
    },
  );
  await check(
    "No-side bet uses false and a separate fresh approval",
    async () => {
      await page.getByRole("radio", { name: "No" }).check();
      await button("Approve 10 ODMK").click();
      await visible("ODMK approval confirmed");
      await button("Place no bet").click();
      await visible("Bet confirmed");
      assert.equal(sim.sent.at(-1).args[1], false);
    },
  );
  await check("Simulation revert prevents wallet broadcast", async () => {
    await button("Approve 10 ODMK").click();
    await visible("ODMK approval confirmed");
    const before = sim.sent.length;
    sim.simulateError = true;
    await button("Place no bet").click();
    await visible("MarketClosed");
    assert.equal(sim.sent.length, before);
    sim.simulateError = false;
    sim.allowance = 0n;
    await refresh();
  });
  await check(
    "Wallet transaction rejection and reverted receipt remain actionable",
    async () => {
      sim.rejected = true;
      await button("Approve 10 ODMK").click();
      await visible("Request rejected");
      sim.rejected = false;
      sim.receiptStatus = "0x0";
      await button("Approve 10 ODMK").click();
      await visible("reverted on-chain");
      assert(
        await page
          .getByRole("link", { name: "View submitted transaction" })
          .isVisible(),
      );
      sim.receiptStatus = "0x1";
    },
  );
  await check(
    "Create validation focuses invalid field; bytes32 question round-trips",
    async () => {
      await button("Create a market").first().click();
      await button("Create market on Sepolia").click();
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "create-question",
      );
      await page.getByLabel("Yes/no question").fill("Will it rain on Friday?");
      const close = new Date(Number(sim.now + 10000n) * 1000);
      const local = new Date(
        close.getTime() - close.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16);
      await page.getByLabel("Closing time").fill(local);
      await page.getByLabel("Resolver address").fill(resolver);
      await button("Create market on Sepolia").click();
      await visible("Market creation confirmed");
      assert.equal(
        sim.sent.at(-1).args[0],
        stringToHex("Will it rain on Friday?", { size: 32 }),
      );
      assert.equal(sim.sent.at(-1).functionName, "createMarket");
    },
  );
  await check(
    "Account change resets wallet state; resolver cannot bet",
    async () => {
      sim.account = resolver;
      await page.evaluate(
        (account) => window.fixtureEmit("accountsChanged", [account]),
        resolver,
      );
      await visible("resolver cannot bet from this address");
      assert(await button(/Place (yes|no) bet/).isDisabled());
    },
  );
  await check(
    "Close boundary disables betting; resolver explicitly confirms settlement",
    async () => {
      const m = sim.markets.at(-1);
      m.closeTime = sim.now;
      await refresh();
      await visible("Awaiting resolver");
      assert.equal(await button("Place yes bet").count(), 0);
      assert(await button("Resolve as yes").isDisabled());
      await page.getByLabel("I understand settlement is final.").check();
      await button("Resolve as yes").click();
      await visible("Resolution confirmed");
      assert.equal(sim.sent.at(-1).functionName, "resolve");
      assert.equal(sim.sent.at(-1).args[1], 1);
    },
  );
  await check(
    "Timeout boundary offers void and invalid refunds can be claimed only once",
    async () => {
      sim.markets.at(-1).outcome = 0;
      sim.markets.at(-1).closeTime = sim.now - 604800n;
      await refresh();
      await visible("Ready to void");
      assert.equal(await button("Resolve as yes").count(), 0);
      await button("Void market to unlock refunds").click();
      await visible("Market void confirmed");
      sim.account = alice;
      sim.claimable = parseEther("20");
      await page.evaluate(
        (account) => window.fixtureEmit("accountsChanged", [account]),
        alice,
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.includes("Claim 20 ODMK") && !b.disabled,
        ),
      );
      await button("Claim 20 ODMK").click();
      await visible("Claim confirmed");
      assert(sim.claimed);
      assert(await button("Claim 0 ODMK").isDisabled());
    },
  );
  await check(
    "RPC failure blocks writes, preserves stale warning, and recovers",
    async () => {
      sim.rpcDown = true;
      await refresh();
      await visible("Live reads unavailable");
      assert(await button("Create market on Sepolia").isDisabled());
      sim.rpcDown = false;
      await button("Retry live reads").click();
      await page.waitForFunction(
        () => !document.body.innerText.includes("Live reads unavailable"),
      );
    },
  );
  await check(
    "Missing bytecode, wrong chain and immutable token mismatch fail closed",
    async () => {
      for (const key of ["codeMissing", "wrongRpc", "tokenMismatch"]) {
        sim[key] = true;
        await refresh();
        await visible("Live reads unavailable");
        assert(await button("Create market on Sepolia").isDisabled());
        sim[key] = false;
        await button("Retry live reads").click();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Live reads unavailable"),
        );
      }
    },
  );
  await check(
    "Pagination and filters read only bounded contract views",
    async () => {
      sim.markets = Array.from({ length: 9 }, (_, i) => makeMarket(i, sim.now));
      await refresh();
      await visible("9 total markets");
      assert.equal(await page.locator(".market-card").count(), 6);
      await button("Older markets").click();
      await visible("Page 2");
      await page.waitForFunction(
        () => document.querySelectorAll(".market-card").length === 3,
      );
      await page.getByRole("button", { name: "Settled", exact: true }).click();
      await visible("No markets in this filter");
      await button("Show all on this page").click();
      await button("Newer markets").click();
      await visible("Page 1");
    },
  );
  await check(
    "Desktop, intermediate and mobile reflow plus 200% text sizing",
    async () => {
      for (const width of [1440, 1024, 800, 540, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Overflow at ${width}`,
        );
      }
      await page.addStyleTag({
        content: "html { font-size: 200% !important; }",
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow with 200% text",
      );
      await page.reload();
      await visible("9 total markets");
    },
  );
  await check(
    "Keyboard create flow, focus styling and automated accessibility",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1050 });
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Skip to markets",
      );
      await button("Create a market").first().focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.activeElement.id === "create-question",
      );
      const outline = await page
        .locator("#create-question")
        .evaluate((el) => getComputedStyle(el).outlineStyle);
      assert.equal(outline, "solid");
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      await writeFile(
        root + "docs/evidence/accessibility.json",
        JSON.stringify(
          {
            violations: axe.violations,
            passes: axe.passes.map((p) => p.id),
            incomplete: axe.incomplete.map((p) => p.id),
          },
          null,
          2,
        ),
      );
      assert.equal(
        axe.violations.length,
        0,
        JSON.stringify(
          axe.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
        ),
      );
    },
  );
  await check("Populated screenshots and no console exceptions", async () => {
    await connect();
    await page.waitForFunction(() => document.querySelector(".wallet-address"));
    await page.locator("#create-market summary").click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: root + "docs/evidence/desktop-fixture.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({
      path: root + "docs/evidence/mobile-fixture.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  });
  await check("Tampered ABI prevents deployment loading", async () => {
    await context.route("**/abi/LaunchToken.json", (route) =>
      route.fulfill({ contentType: "application/json", body: "[]" }),
    );
    await page.reload();
    await visible("ABI verification failed");
    assert.equal(await button("Place yes bet").count(), 0);
  });
} catch (error) {
  tests.push({ name: "FAILED", passed: false, error: error.stack });
  await mkdir(root + "test/scratch", { recursive: true });
  await page.screenshot({
    path: root + "test/scratch/failure.png",
    fullPage: true,
  });
  console.error(error);
  console.error(await page.locator("[role=alert]").allTextContents());
  process.exitCode = 1;
} finally {
  await writeFile(
    root + "docs/evidence/interactions.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        exportUrl: "/preview/",
        mockedWalletAndRPC: true,
        realTransactions: 0,
        tests,
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
