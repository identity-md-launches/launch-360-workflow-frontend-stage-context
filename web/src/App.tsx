import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAddress, zeroAddress } from "viem";
import { loadConfig, type Config } from "./config";
import {
  amount,
  encodeQuestion,
  errorMessage,
  exact,
  parseAmount,
  question,
  short,
  status,
  WINDOW,
  type Market,
} from "./model";
import { PAGE_SIZE, useMarkets } from "./useMarkets";

const date = (time: bigint) =>
  new Date(Number(time) * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
function Logo() {
  return (
    <a className="brand" href="#">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      oddsmaker<span className="brand-dot">.</span>
    </a>
  );
}
export default function App() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState("");
  useEffect(() => {
    loadConfig()
      .then(setConfig)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (!config)
    return (
      <div className="shell">
        <header>
          <Logo />
        </header>
        <main>
          <h1>
            A question.
            <br />
            Two sides.
          </h1>
          <p role={error ? "alert" : "status"}>
            {error || "Loading the verified deployment…"}
          </p>
          {error && (
            <button onClick={() => location.reload()}>Reload deployment</button>
          )}
        </main>
      </div>
    );
  return <MarketApp config={config} />;
}
function MarketApp({ config }: { config: Config }) {
  const state = useMarkets(config);
  const { data, account, ready, pending } = state;
  const [selectedId, setSelectedId] = useState<bigint>();
  const [filter, setFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [, tick] = useState(0);
  const questionInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const now = data
    ? data.now +
      BigInt(Math.max(0, Math.floor((Date.now() - data.fetchedAt) / 1000)))
    : 0n;
  const markets = (data?.markets || []).filter(
    (m) =>
      filter === "All" ||
      (filter === "Open" ? status(m, now) === "Open" : m.outcome !== 0),
  );
  const selected = markets.find((m) => m.id === selectedId) || markets[0];
  const openCreate = () => {
    setCreateOpen(true);
    setTimeout(() => questionInput.current?.focus(), 0);
  };
  const wrongChain = account && state.walletChain !== config.chain.id;
  return (
    <div className="shell">
      <a href="#markets" className="skip">
        Skip to markets
      </a>
      <header className="header">
        <Logo />
        <nav aria-label="Main navigation">
          <a href="#markets">Markets</a>
          <a href="#about">How it works</a>
        </nav>
        <div className="header-wallet">
          <span className="network">
            <span className="dot" />
            {config.chain.name} testnet
          </span>
          <button
            className={account ? "wallet-button" : "primary"}
            disabled={pending}
            onClick={state.connect}
          >
            {account ? short(account) : "Connect wallet"}
            <Arrow />
          </button>
        </div>
      </header>
      <main>
        <section className="hero" aria-labelledby="headline">
          <div>
            <p className="eyebrow">An open experiment in prediction</p>
            <h1 id="headline">
              A question. Two sides.
              <br />
              <span>Your call.</span>
            </h1>
            <p className="intro">
              Put your perspective in the pool. Create a yes/no market, back an
              outcome, and see where everyone stands.
            </p>
            <button className="dark-button" onClick={openCreate}>
              Create a market <span aria-hidden="true">＋</span>
            </button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="choice-art art-yes">
              <span>Yes</span>
              <strong>↗</strong>
              <small>ONE POSSIBILITY</small>
            </div>
            <div className="choice-art art-no">
              <span>No</span>
              <strong>↘</strong>
              <small>ANOTHER PERSPECTIVE</small>
            </div>
            <span className="art-caption">Two sides. One shared pool.</span>
          </div>
        </section>
        <div className="testnet-note">
          <span className="note-icon" aria-hidden="true">
            ⓘ
          </span>
          <p>
            <strong>A testing ground, with no real value.</strong> These are
            Sepolia test markets. Stakes and payouts use ODMK.
          </p>
          <a href="#about">
            Know the rules <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="workspace">
          <section
            id="markets"
            className="market-section"
            aria-labelledby="market-heading"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">The market board</p>
                <h2 id="market-heading">Where do you stand?</h2>
              </div>
              <button
                className="small-button"
                onClick={() => void state.refresh()}
                disabled={state.loading}
              >
                ↻ {state.loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <div className="board-tools">
              <div
                className="filters"
                role="group"
                aria-label="Filter this page"
              >
                {["All", "Open", "Settled"].map((value) => (
                  <button
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <span className="muted small">
                {data
                  ? `${data.count} total ${data.count === 1n ? "market" : "markets"}`
                  : "Reading the chain…"}
              </span>
            </div>
            {state.readError && (
              <div role="alert" className="error">
                <strong>Live reads unavailable</strong>
                <p>{state.readError}</p>
                <p>
                  Actions are disabled until a refresh succeeds. Any displayed
                  values may be stale.
                </p>
                <button onClick={() => void state.refresh()}>
                  Retry live reads
                </button>
              </div>
            )}
            {!data && !state.readError ? (
              <div className="empty">
                <span className="empty-symbol" aria-hidden="true">
                  ◌
                </span>
                <h3>Reading the market board</h3>
                <p>Checking the deployment and current contract state.</p>
              </div>
            ) : markets.length ? (
              <div className="market-grid">
                {markets.map((m) => (
                  <MarketCard
                    key={m.id.toString()}
                    market={m}
                    now={now}
                    selected={selected?.id === m.id}
                    decimals={data!.decimals}
                    onSelect={() => {
                      setSelectedId(m.id);
                      document
                        .getElementById("ticket")
                        ?.scrollIntoView({ block: "nearest" });
                    }}
                  />
                ))}
              </div>
            ) : (
              data && (
                <div className="empty">
                  <span className="empty-symbol" aria-hidden="true">
                    ↗
                  </span>
                  <p className="eyebrow">Every market starts with a question</p>
                  <h3>
                    {data.count === 0n
                      ? "Make the first call."
                      : "No markets in this filter."}
                  </h3>
                  <p>
                    {data.count === 0n
                      ? "Choose a question and a resolver. Let the pool take a side."
                      : "Filters apply to the six markets on this page. Try another filter or page."}
                  </p>
                  <button
                    onClick={
                      data.count === 0n ? openCreate : () => setFilter("All")
                    }
                  >
                    {data.count === 0n
                      ? "Create the first market"
                      : "Show all on this page"}{" "}
                    <Arrow />
                  </button>
                </div>
              )
            )}
            {data && data.count > PAGE_SIZE && (
              <div className="pagination">
                <button
                  disabled={!state.page || state.loading}
                  onClick={() => state.setPage((p) => p - 1)}
                >
                  Newer markets
                </button>
                <span>Page {state.page + 1}</span>
                <button
                  disabled={
                    BigInt(state.page + 1) * PAGE_SIZE >= data.count ||
                    state.loading
                  }
                  onClick={() => state.setPage((p) => p + 1)}
                >
                  Older markets
                </button>
              </div>
            )}
            <p className="read-status" role="status">
              {data
                ? `Contract views · Block ${data.block.toLocaleString("en-US")} · Refreshes every 20 seconds`
                : "Market lists come directly from contract views."}
            </p>
            <details
              id="create-market"
              className="create-panel"
              open={createOpen}
              onToggle={(event) => setCreateOpen(event.currentTarget.open)}
            >
              <summary>
                <span>
                  <span className="eyebrow">Bring a new perspective</span>
                  <strong>Create a market</strong>
                </span>
                <span aria-hidden="true">＋</span>
              </summary>
              <CreateForm
                config={config}
                state={state}
                questionRef={questionInput}
                now={now}
              />
            </details>
          </section>
          <aside className="side-column" aria-label="Wallet and market actions">
            <section className="wallet-panel">
              <div className="panel-heading">
                <h2>Your test wallet</h2>
                <span className="token-badge">ODMK</span>
              </div>
              <div className="balance">
                <strong
                  title={data ? exact(data.balance, data.decimals) : undefined}
                >
                  {account && data ? amount(data.balance, data.decimals) : "—"}
                </strong>
                <span>ODMK balance</span>
              </div>
              <div className="allowance">
                <span>Market allowance</span>
                <strong
                  title={
                    data ? exact(data.allowance, data.decimals) : undefined
                  }
                >
                  {account && data
                    ? `${amount(data.allowance, data.decimals)} ODMK`
                    : "—"}
                </strong>
              </div>
              {account ? (
                <p className="small muted wallet-address">
                  Connected:{" "}
                  <a
                    href={`${config.manifest.network.explorer}/address/${account}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {account} <Arrow />
                  </a>
                </p>
              ) : (
                <p className="small muted">
                  Connect a browser wallet to see your balance, approve ODMK,
                  and take a side.
                </p>
              )}
              {wrongChain && (
                <div className="error">
                  <p>
                    Wallet is on chain {state.walletChain}. Use{" "}
                    {config.chain.name} to continue.
                  </p>
                  <button disabled={pending} onClick={state.switchChain}>
                    Switch to {config.chain.name}
                  </button>
                </div>
              )}
              <p className="token-help">
                Get ODMK by swapping Sepolia ETH in the launch pool. Swapping
                happens outside this page.
              </p>
            </section>
            <div className="activity" aria-live="polite" role="status">
              {state.notice}
            </div>
            {state.error && (
              <div className="error" role="alert">
                <p>{state.error}</p>
                <button
                  className="text-button"
                  onClick={() => state.setError("")}
                >
                  Dismiss message
                </button>
              </div>
            )}
            {state.tx && (
              <a
                className="transaction-link"
                href={`${config.manifest.network.explorer}/tx/${state.tx}`}
                target="_blank"
                rel="noreferrer"
              >
                View submitted transaction <Arrow />
              </a>
            )}
            {selected ? (
              <Ticket
                key={`${selected.id}-${account}`}
                config={config}
                state={state}
                market={selected}
                now={now}
              />
            ) : (
              <section className="ticket placeholder-ticket">
                <span className="eyebrow">Your next perspective</span>
                <h2>
                  Find a question.
                  <br />
                  Take a side.
                </h2>
                <p>
                  Select a market to see its pool, resolver, and available
                  actions.
                </p>
                <div className="mini-sides" aria-hidden="true">
                  <span>Yes ↗</span>
                  <span>No ↘</span>
                </div>
              </section>
            )}
            {!account && (
              <button
                className="full connect-secondary"
                disabled={pending}
                onClick={state.connect}
              >
                Connect wallet to participate <Arrow />
              </button>
            )}
            {account && !ready && !wrongChain && !pending && (
              <p className="small muted">
                Waiting for verified, fresh wallet and contract reads. Use
                Refresh if this persists.
              </p>
            )}
          </aside>
        </div>
        <section id="about" className="about" aria-labelledby="about-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">The rules are on-chain</p>
              <h2 id="about-heading">Simple stakes. Shared outcomes.</h2>
            </div>
            <span className="fee-badge">0% market fee</span>
          </div>
          <div className="how-grid">
            <div>
              <span className="step">01</span>
              <h3>Back a side</h3>
              <p>
                Approve an exact ODMK amount, then bet yes or no before closing.
                Pool shares show the implied odds, not a forecast or a
                guaranteed return.
              </p>
            </div>
            <div>
              <span className="step">02</span>
              <h3>Trust the resolver</h3>
              <p>
                The named human resolver decides the outcome and could bet
                through another address. There is no oracle or appeal. Pick
                markets with care.
              </p>
            </div>
            <div>
              <span className="step">03</span>
              <h3>Collect your share</h3>
              <p>
                Winners split the pool in proportion to their stakes. Invalid
                markets refund both sides. After seven unresolved days, anyone
                can void a market to unlock refunds.
              </p>
            </div>
          </div>
          <p className="rounding-note">
            Payouts are claimed by each bettor. Rounding leaves at most one ODMK
            base unit per winner in the contract. An outcome with no winning
            stake becomes invalid.
          </p>
        </section>
      </main>
      <footer>
        <div>
          <Logo />
          <p>lab-prediction-market · A Sepolia experiment</p>
        </div>
        <div className="contract-links">
          {config.manifest.contracts.map((c) => (
            <a
              key={c.name}
              href={`${config.manifest.network.explorer}/address/${c.address}`}
              target="_blank"
              rel="noreferrer"
            >
              {c.name} <span>{short(c.address)}</span> <Arrow />
            </a>
          ))}
          <a href="./imd-deployment.json">
            Deployment manifest <Arrow />
          </a>
        </div>
      </footer>
    </div>
  );
}
function MarketCard({
  market: m,
  now,
  selected,
  decimals,
  onSelect,
}: {
  market: Market;
  now: bigint;
  selected: boolean;
  decimals: number;
  onSelect: () => void;
}) {
  const s = status(m, now);
  return (
    <button
      className={`market-card ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
      aria-label={`View market ${m.id}: ${question(m.question)}`}
    >
      <div className="card-meta">
        <span>Market #{m.id.toString().padStart(2, "0")}</span>
        <span className={`status ${s === "Open" ? "open" : ""}`}>
          {s === "Open" && <span className="dot" />}
          {s}
        </span>
      </div>
      <h3>{question(m.question)}</h3>
      <div className="odds-labels">
        <strong>
          Yes <span>{Number(m.yesBps) / 100}%</span>
        </strong>
        <strong>
          No <span>{Number(m.noBps) / 100}%</span>
        </strong>
      </div>
      <div className="odds-bar" aria-hidden="true">
        <span style={{ width: `${Number(m.yesBps) / 100}%` }} />
      </div>
      <div className="card-bottom">
        <span>
          <strong>{amount(m.yesPool + m.noPool, decimals)}</strong> ODMK pool
        </span>
        <span>{selected ? "Selected ↗" : "View market ↗"}</span>
      </div>
      <span className="card-date">
        {now < m.closeTime ? "Closes" : "Closed"} {date(m.closeTime)}
      </span>
    </button>
  );
}
type State = ReturnType<typeof useMarkets>;
function Ticket({
  config,
  state,
  market: m,
  now,
}: {
  config: Config;
  state: State;
  market: Market;
  now: bigint;
}) {
  const [yes, setYes] = useState(true);
  const [text, setText] = useState("10");
  const [outcome, setOutcome] = useState("1");
  const [confirmed, setConfirmed] = useState(false);
  const [inputError, setInputError] = useState("");
  const { data, account, ready, pending } = state;
  const decimals = data?.decimals || 18;
  let value = 0n;
  let amountError = "";
  try {
    value = parseAmount(text, decimals);
  } catch (e) {
    amountError = errorMessage(e);
  }
  const isResolver = account?.toLowerCase() === m.resolver.toLowerCase();
  const open = status(m, now) === "Open";
  const funded = !!data && value <= data.balance;
  const approved = !!data && value > 0n && data.allowance >= value;
  const canBet = ready && open && !isResolver && !amountError && funded;
  const canResolve =
    ready &&
    isResolver &&
    !m.outcome &&
    now >= m.closeTime &&
    now < m.closeTime + WINDOW;
  const run = (name: string, args: readonly unknown[], label: string) =>
    void state.transact(config.market, name, args, label);
  return (
    <section id="ticket" className="ticket" aria-labelledby="ticket-heading">
      <div className="panel-heading">
        <span className="eyebrow">
          Market #{m.id.toString().padStart(2, "0")}
        </span>
        <span className="status">{status(m, now)}</span>
      </div>
      <h2 id="ticket-heading">{question(m.question)}</h2>
      <dl className="market-details">
        <div>
          <dt>Closes</dt>
          <dd>{date(m.closeTime)}</dd>
        </div>
        <div>
          <dt>Resolver</dt>
          <dd>
            <a
              title={m.resolver}
              href={`${config.manifest.network.explorer}/address/${m.resolver}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(m.resolver)} <Arrow />
            </a>
          </dd>
        </div>
        <div>
          <dt>Resolution deadline</dt>
          <dd>{date(m.closeTime + WINDOW)}</dd>
        </div>
        <div>
          <dt>Yes / No pools</dt>
          <dd>
            {amount(m.yesPool, decimals)} / {amount(m.noPool, decimals)} ODMK
          </dd>
        </div>
      </dl>
      {open && (
        <>
          <fieldset className="side-choice">
            <legend>Pick your side</legend>
            <label className={yes ? "chosen" : ""}>
              <input
                type="radio"
                name={`side-${m.id}`}
                checked={yes}
                onChange={() => setYes(true)}
              />
              Yes <span>↗</span>
            </label>
            <label className={!yes ? "chosen no" : ""}>
              <input
                type="radio"
                name={`side-${m.id}`}
                checked={!yes}
                onChange={() => setYes(false)}
              />
              No <span>↘</span>
            </label>
          </fieldset>
          <label className="field" htmlFor="stake">
            Stake amount <span>ODMK</span>
            <input
              id="stake"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setInputError("");
              }}
              onBlur={() => setInputError(amountError)}
              aria-invalid={!!inputError}
              aria-describedby="stake-hint"
            />
          </label>
          <p
            id="stake-hint"
            className={inputError ? "field-error" : "small muted"}
          >
            {inputError ||
              (value && !funded && account
                ? "Your ODMK balance is below this stake."
                : "Only the approved amount can be spent by the market.")}
          </p>
          <p className="action-summary">
            You will stake{" "}
            <strong>
              {text || "0"} ODMK on {yes ? "yes" : "no"}
            </strong>
            . Stakes cannot be withdrawn before settlement. You may lose the
            full stake.
          </p>
          {isResolver && (
            <p className="field-error">
              The resolver cannot bet from this address.
            </p>
          )}
          <div className="action-steps">
            <button
              disabled={!canBet || approved}
              onClick={() =>
                void state.transact(
                  config.token,
                  "approve",
                  [config.market.address, value],
                  "ODMK approval",
                )
              }
            >
              <span className="step-number">1</span>
              {approved
                ? "ODMK allowance sufficient"
                : `Approve ${text || "0"} ODMK`}
            </button>
            <button
              className="dark-button"
              disabled={!canBet || !approved}
              onClick={() => run("bet", [m.id, yes, value], "Bet")}
            >
              <span className="step-number">2</span>Place {yes ? "yes" : "no"}{" "}
              bet <Arrow />
            </button>
          </div>
        </>
      )}
      {account && (
        <div className="position">
          <h3>Your position</h3>
          <dl>
            <div>
              <dt>Yes stake</dt>
              <dd>{amount(m.yesStake, decimals)} ODMK</dd>
            </div>
            <div>
              <dt>No stake</dt>
              <dd>{amount(m.noStake, decimals)} ODMK</dd>
            </div>
            <div>
              <dt>Claimable now</dt>
              <dd title={exact(m.claimable, decimals)}>
                {amount(m.claimable, decimals)} ODMK
              </dd>
            </div>
          </dl>
        </div>
      )}
      {m.outcome !== 0 && (
        <>
          <p className="small muted">
            {m.claimed
              ? "You have already claimed this market."
              : m.claimable > 0n
                ? "Collect your payout or refund to your connected wallet."
                : account
                  ? "This wallet has no claimable payout."
                  : "Connect a wallet to check your payout."}
          </p>
          <button
            className="dark-button full"
            disabled={!ready || m.claimable === 0n || m.claimed}
            onClick={() => run("claim", [m.id], "Claim")}
          >
            Claim {amount(m.claimable, decimals)} ODMK <Arrow />
          </button>
        </>
      )}
      {!m.outcome && now >= m.closeTime + WINDOW && (
        <>
          <p className="small muted">
            The resolver’s seven-day window has ended. Anyone can void this
            market. Bettors then claim their own refunds.
          </p>
          <button
            className="full"
            disabled={!ready}
            onClick={() => run("voidMarket", [m.id], "Market void")}
          >
            Void market to unlock refunds
          </button>
        </>
      )}
      {!m.outcome && now >= m.closeTime && now < m.closeTime + WINDOW && (
        <div className="resolution">
          <p className="small muted">
            {isResolver
              ? "You are this market’s resolver. Settlement is final. An empty winning side becomes invalid."
              : "Betting is closed. Only the named resolver can settle during the seven-day window."}
          </p>
          <label className="field" htmlFor="outcome">
            Final outcome
            <select
              id="outcome"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setConfirmed(false);
              }}
              disabled={!isResolver || pending}
            >
              <option value="1">Yes</option>
              <option value="2">No</option>
              <option value="3">Invalid — refund both sides</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={!isResolver || pending}
            />
            I understand settlement is final.
          </label>
          <button
            className="dark-button full"
            disabled={!canResolve || !confirmed}
            onClick={() =>
              run("resolve", [m.id, Number(outcome)], "Resolution")
            }
          >
            Resolve as{" "}
            {outcome === "1" ? "yes" : outcome === "2" ? "no" : "invalid"}
          </button>
        </div>
      )}
      {!account && (
        <p className="small muted">
          Connect your wallet to enable available actions.
        </p>
      )}
    </section>
  );
}
function CreateForm({
  config,
  state,
  questionRef,
  now,
}: {
  config: Config;
  state: State;
  questionRef: React.RefObject<HTMLInputElement | null>;
  now: bigint;
}) {
  const [questionText, setQuestion] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [resolver, setResolver] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    let encoded: ReturnType<typeof encodeQuestion> | undefined;
    try {
      encoded = encodeQuestion(questionText);
    } catch (e) {
      next.question = errorMessage(e);
    }
    const seconds = Math.floor(new Date(closeTime).getTime() / 1000);
    if (
      !Number.isFinite(seconds) ||
      seconds < Number(now) + 3660 ||
      seconds > Number(now) + 7776000
    )
      next.close =
        "Choose a time from 1 hour and 1 minute to 90 days ahead. The extra minute allows for inclusion.";
    if (!isAddress(resolver) || resolver.toLowerCase() === zeroAddress)
      next.resolver = "Enter a valid, nonzero Ethereum resolver address.";
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(`create-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    void state.transact(
      config.market,
      "createMarket",
      [encoded!, BigInt(seconds), resolver],
      "Market creation",
    );
  };
  return (
    <form onSubmit={submit} noValidate>
      <p className="small muted">
        Creation uses no ODMK; your wallet pays Sepolia gas. The named resolver
        decides the outcome and cannot bet from that same address.
      </p>
      <label className="field" htmlFor="create-question">
        Yes/no question
        <input
          ref={questionRef}
          id="create-question"
          name="question"
          placeholder="Will it rain on Friday?"
          value={questionText}
          onChange={(e) => setQuestion(e.target.value)}
          aria-invalid={!!errors.question}
          aria-describedby="question-hint"
        />
      </label>
      <p
        id="question-hint"
        className={errors.question ? "field-error" : "field-hint"}
      >
        {errors.question ||
          `${new TextEncoder().encode(questionText).length}/32 UTF-8 bytes. Be specific about the event and date.`}
      </p>
      <div className="form-grid">
        <div>
          <label className="field" htmlFor="create-close">
            Closing time (your local time)
            <input
              id="create-close"
              name="closeTime"
              type="datetime-local"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              aria-invalid={!!errors.close}
              aria-describedby="close-hint"
            />
          </label>
          <p
            id="close-hint"
            className={errors.close ? "field-error" : "field-hint"}
          >
            {errors.close || "Between 1 hour + 1 minute and 90 days from now."}
          </p>
        </div>
        <div>
          <label className="field" htmlFor="create-resolver">
            Resolver address
            <input
              id="create-resolver"
              name="resolver"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={resolver}
              onChange={(e) => setResolver(e.target.value)}
              aria-invalid={!!errors.resolver}
              aria-describedby="resolver-hint"
            />
          </label>
          <p
            id="resolver-hint"
            className={errors.resolver ? "field-error" : "field-hint"}
          >
            {errors.resolver || "A human you trust to settle the question."}
          </p>
        </div>
      </div>
      <button className="dark-button" disabled={!state.ready} type="submit">
        Create market on Sepolia <Arrow />
      </button>
      {!state.account && (
        <p className="small muted">
          Connect a wallet before creating a market.
        </p>
      )}
    </form>
  );
}
