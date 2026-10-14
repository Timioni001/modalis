"use client";

/** Modalis Twin: explore two futures, then turn the chosen one into an owner-signed plan update. */
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { setMandate, type MandateParams } from "@modalis/chain";
import {
  Badge,
  Button,
  Card,
  Choices,
  Field,
  Label,
  Loading,
  Notice,
  PageHeader,
  Row,
  Rows,
  SectionTitle,
  Stat,
  TextField,
  MoneyField,
} from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { useWallet, useWalletConfig } from "@/components/wallet-context";
import { apiGet, apiPost, ApiError } from "@/lib/client-api";
import { confirmOnChain } from "@/lib/chain-client";
import { walletActionMessage } from "@/lib/wallet-error";
import type { Address } from "viem";
import type { SystemStatus } from "@/lib/api-types";

type Candidate = { target: string; months: number; monthly: string; withdrawal: string; risk: "cautious" | "balanced" | "adventurous" };
type MoneyView = { amount: string; currency: "USD" };
type Outcome = { expected: MoneyView; downside: MoneyView; upside: MoneyView; expectedShortfall: MoneyView; downsideShortfall: MoneyView; requiredMonthly: MoneyView; confidencePct: number; reachesOnExpectedPath: boolean; assumptions: string[] };
type Comparison = { expectedDelta: MoneyView; downsideDelta: MoneyView; requiredMonthlyDelta: MoneyView };
type TwinResult = { base: Outcome; alternative: Outcome; comparison: Comparison; baseCandidate: Candidate; alternativeCandidate: Candidate; assumption: string };
type SavedFuture = { id: string; prompt: string; createdAt: string; candidate: Candidate; selected: boolean };
type TwinData = TwinResult & { goal: { name: string; target: MoneyView }; planVersion: number; savedFutures: SavedFuture[]; valuationAvailable: boolean; balanceNote: string | null };
type Approval = { params: Record<string, string | number>; allocations: { token: string; targetBps: number; minBps: number; maxBps: number }[] };
type PrepareResult = { approval: Approval; scenarioId: string | null; preview: { current: Record<string, string | number>; proposed: Record<string, string | number> }; note: string };

function toMandateParams(value: Approval["params"]): MandateParams {
  return { targetValue: BigInt(value.targetValue), targetDate: BigInt(value.targetDate), maxDrawdownBps: Number(value.maxDrawdownBps), minLiquidityBps: Number(value.minLiquidityBps), rebalanceThresholdBps: Number(value.rebalanceThresholdBps), maxSingleAssetBps: Number(value.maxSingleAssetBps), maxSlippageBps: Number(value.maxSlippageBps) };
}
function amount(value: number): string { return Number.isFinite(value) ? value.toFixed(2) : "0.00"; }
function displayMoney(money: MoneyView): string { const value = Number(money.amount); return Number.isFinite(value) ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : `$${money.amount}`; }
function deltaLabel(money: MoneyView): string { const value = Number(money.amount); if (!Number.isFinite(value) || value === 0) return "$0"; return `${value > 0 ? "+" : "−"}${displayMoney({ amount: Math.abs(value).toFixed(2), currency: "USD" })}`; }

export default function ScenariosPage() { return <PortfolioGate><Twin /></PortfolioGate>; }

function Twin() {
  const { configured, chainId, rpcUrl } = useWalletConfig();
  const { loggedIn, getWalletClient } = useWallet();
  const [data, setData] = useState<TwinData | null>(null);
  const [alternative, setAlternative] = useState<Candidate | null>(null);
  const [result, setResult] = useState<TwinResult | null>(null);
  const [savedFutures, setSavedFutures] = useState<SavedFuture[]>([]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  const [busy, setBusy] = useState<"loading" | "simulating" | "saving" | "preparing" | "signing" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("loading"); setError(null);
    try { const response = await apiGet<TwinData>("/api/twin"); setData(response); setSavedFutures(response.savedFutures ?? []); setAlternative(response.alternativeCandidate); setScenarioId(null); setResult(response); }
    catch (err) { setError(err instanceof ApiError ? err.message : "We couldn't load your futures."); }
    finally { setBusy(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const simulate = useCallback(async () => {
    if (!alternative) return; setBusy("simulating"); setError(null); setPrepared(null); setSuccess(null);
    try { setResult(await apiPost<TwinResult>("/api/twin/simulate", { alternative })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "We couldn't compare those futures."); }
    finally { setBusy(null); }
  }, [alternative]);

  const openSaved = useCallback(async (future: SavedFuture) => {
    setAlternative(future.candidate); setScenarioId(future.id); setPrepared(null); setSuccess(null); setBusy("simulating"); setError(null);
    try { setResult(await apiPost<TwinResult>("/api/twin/simulate", { alternative: future.candidate })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "We couldn't open that future."); }
    finally { setBusy(null); }
  }, []);

  const createAnother = useCallback(() => {
    if (!data) return;
    setAlternative(data.alternativeCandidate); setScenarioId(null); setPrepared(null); setResult(data); setError(null); setSuccess(null);
  }, [data]);

  const save = useCallback(async () => {
    if (!alternative || !result) return; setBusy("saving"); setError(null);
    try { const response = await apiPost<{ saved: boolean; scenarioId?: string | null; savedFuture?: SavedFuture | null; note?: string }>("/api/twin/save", { prompt: `${alternative.target} dollars in ${alternative.months} months with a ${alternative.risk} approach`, alternative }); setScenarioId(response.scenarioId ?? null); if (response.savedFuture) setSavedFutures((current) => [response.savedFuture!, ...current.filter((future) => future.id !== response.savedFuture!.id)]); setSuccess(response.saved ? "Future saved to your history." : (response.note ?? "Future calculated; history is temporarily unavailable.")); }
    catch (err) { setError(err instanceof ApiError ? err.message : "We couldn't save that future."); }
    finally { setBusy(null); }
  }, [alternative, result]);

  const prepare = useCallback(async () => {
    if (!alternative) return; setBusy("preparing"); setError(null); setSuccess(null);
    try { setPrepared(await apiPost<PrepareResult>("/api/twin/prepare", { alternative, scenarioId })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "We couldn't prepare that plan update."); }
    finally { setBusy(null); }
  }, [alternative, scenarioId]);

  const approve = useCallback(async () => {
    if (!alternative || !prepared || !loggedIn) return; setBusy("signing"); setError(null);
    try {
      const wallet = await getWalletClient(); const status = await apiGet<SystemStatus>("/api/status");
      const contracts = (status.technical?.contracts ?? {}) as Record<string, Address>;
      if (!contracts.portfolioMandate) throw new Error("Modalis isn't set up on this network yet.");
      const hash = await setMandate(wallet, { chainId, contracts, tokens: (status.technical?.tokens ?? {}) as Record<string, Address> }, toMandateParams(prepared.approval.params), prepared.approval.allocations.map((a) => ({ token: a.token as Address, targetBps: a.targetBps, minBps: a.minBps, maxBps: a.maxBps })));
      const confirmed = await confirmOnChain(hash, { chainId, rpcUrl });
      await apiPost("/api/twin/approve", { alternative, scenarioId, setTxHash: hash });
      setSuccess(`Plan updated on Monad. Confirmed in ${Math.round(confirmed.ms / 100) / 10}s.`); setPrepared(null); await load();
    } catch (err) { setError(walletActionMessage(err, "We couldn't approve that future. Nothing was changed.")); }
    finally { setBusy(null); }
  }, [alternative, prepared, loggedIn, getWalletClient, chainId, rpcUrl, scenarioId, load]);

  if (busy === "loading" && !data) return <Loading label="Loading your current plan" />;
  if (!data || !alternative || !result) return <div className="space-y-4"><PageHeader title="Modalis Twin" lede="Explore another future without touching your real plan." />{error ? <Notice tone="warn" title="Twin is unavailable" action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>}>{error}</Notice> : null}</div>;

  const fields = [
    { label: "Target amount", value: Number(alternative.target), set: (value: number) => setAlternative({ ...alternative, target: amount(value) }) },
    { label: "Monthly contribution", value: Number(alternative.monthly), set: (value: number) => setAlternative({ ...alternative, monthly: amount(value) }) },
    { label: "Planned withdrawal", value: Number(alternative.withdrawal), set: (value: number) => setAlternative({ ...alternative, withdrawal: amount(value) }) },
  ];

  return <div className="space-y-5 pb-12">
    <PageHeader title="Modalis Twin" lede="Try a different future beside your current plan. Every number updates from deterministic rules, and exploring never moves your money." action={<Button href="/app/goals" variant="secondary">Manage goals</Button>} />
    {error ? <Notice tone="warn" title="We couldn't complete that step" action={<Button variant="secondary" onClick={() => setError(null)}>Dismiss</Button>}>{error}</Notice> : null}
    {success ? <Notice tone="ok" title="All set">{success}</Notice> : null}
    {!data.valuationAvailable ? <Notice tone="warn" title="Live balance is temporarily unavailable">{data.balanceNote ?? "Twin is using the saved starting amount until portfolio prices refresh. Your plan and funds are unchanged."}</Notice> : null}

    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="grid gap-4 lg:grid-cols-2">
      <Card className="border border-line" lift><div className="flex items-center justify-between gap-3"><div><Label>Future one</Label><h2 className="display mt-1 text-2xl font-semibold text-ink">Your live plan</h2></div><Badge tone="ok">Live</Badge></div><p className="mt-3 text-sm leading-relaxed text-ink-soft">The chain-backed plan you already approved. Twin does not edit it while you explore.</p><div className="mt-5 grid grid-cols-2 gap-4"><Stat label="Goal" value={displayMoney({ amount: data.baseCandidate.target, currency: "USD" })} size="sm" /><Stat label="Monthly" value={displayMoney({ amount: data.baseCandidate.monthly, currency: "USD" })} size="sm" /><Stat label="Time left" value={`${data.baseCandidate.months} mo`} size="sm" /><Stat label="Risk" value={data.baseCandidate.risk[0].toUpperCase() + data.baseCandidate.risk.slice(1)} size="sm" /></div></Card>
      <Card className="border-2 border-ink" lift><div className="flex items-center justify-between gap-3"><div><Label>Future two</Label><h2 className="display mt-1 text-2xl font-semibold text-ink">Try another path</h2></div><Badge tone="default">Editable</Badge></div><p className="mt-3 text-sm leading-relaxed text-ink-soft">Change the deadline, what you add, a planned withdrawal, or the guardrails.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{fields.slice(0, 2).map((field) => <Field key={field.label} label={field.label} htmlFor={`twin-${field.label}`}><MoneyField id={`twin-${field.label}`} value={field.value} onChange={field.set} max={100_000_000} /></Field>)}<Field label="Time until the goal" htmlFor="twin-months" hint="1 to 600 months"><TextField id="twin-months" type="number" min={1} max={600} inputMode="numeric" value={alternative.months} onChange={(event) => setAlternative({ ...alternative, months: Math.max(1, Math.min(600, Number(event.target.value) || 1)) })} /></Field>{fields.slice(2).map((field) => <Field key={field.label} label={field.label} htmlFor={`twin-${field.label}`} hint="Simulation only"><MoneyField id={`twin-${field.label}`} value={field.value} onChange={field.set} max={100_000_000} /></Field>)}</div><div className="mt-4"><Label>Risk preference</Label><div className="mt-2"><Choices name="twin-risk" value={alternative.risk} onChange={(risk) => setAlternative({ ...alternative, risk })} options={[{ value: "cautious", label: "Cautious", hint: "More available cash" }, { value: "balanced", label: "Balanced", hint: "A middle path" }, { value: "adventurous", label: "Adventurous", hint: "More movement" }]} /></div></div><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => void simulate()} busy={busy === "simulating"}>Update comparison</Button><Button variant="secondary" onClick={() => void save()} busy={busy === "saving"}>Save this future</Button></div></Card>
    </motion.div>

    <Card className="bg-sunken shadow-none"><SectionTitle hint="Saved branches are read-only until you choose one and approve its proposed update.">Your saved futures</SectionTitle>{savedFutures.length === 0 ? <p className="text-sm leading-relaxed text-ink-soft">Save a branch to compare it again later. You can create as many alternatives as you need without changing your live plan.</p> : <Rows className="mt-2">{savedFutures.map((future) => <Row key={future.id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-ink">{future.prompt}</p><p className="mt-1 text-xs text-ink-muted">Saved {future.createdAt.slice(0, 10)} · {future.selected ? "Approved" : "Exploring"}</p></div><Button variant="secondary" onClick={() => void openSaved(future)} busy={busy === "simulating" && scenarioId === future.id}>Open</Button></Row>)}</Rows>}<div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={createAnother}>Create another future</Button><Button href="/app/goals" variant="quiet">Add or reorder goals</Button></div></Card>

    <Card><SectionTitle hint="The live balance is the same starting point for both paths. The only changes are the assumptions you can see above.">Side-by-side outcome</SectionTitle><div className="grid gap-3 sm:grid-cols-2"><OutcomeCard title="Your live plan" outcome={result.base} /><OutcomeCard title="The future you are exploring" outcome={result.alternative} accent /></div><Rows className="mt-4"><Row className="flex items-center justify-between gap-4"><span className="text-sm text-ink-muted">Expected balance difference</span><strong className={toneFor(result.comparison.expectedDelta)}>{deltaLabel(result.comparison.expectedDelta)}</strong></Row><Row className="flex items-center justify-between gap-4"><span className="text-sm text-ink-muted">Downside balance difference</span><strong className={toneFor(result.comparison.downsideDelta)}>{deltaLabel(result.comparison.downsideDelta)}</strong></Row><Row className="flex items-center justify-between gap-4"><span className="text-sm text-ink-muted">Required monthly difference without growth</span><strong className={toneForNeg(result.comparison.requiredMonthlyDelta)}>{deltaLabel(result.comparison.requiredMonthlyDelta)}</strong></Row></Rows></Card>

    <Card className="bg-sunken shadow-none"><SectionTitle hint="These settings become the boundaries Modalis cannot cross after you approve them.">Turn the chosen future into a plan</SectionTitle><p className="text-sm leading-relaxed text-ink-soft">Twin prepares one owner-signed update to your Monad plan. It keeps the existing allocation ranges, changes the target and date, and applies the risk guardrails you chose. No deposit, withdrawal, or trade is part of this action.</p>{prepared ? <div className="mt-5 rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><Label>Review before signing</Label><p className="mt-1 font-semibold text-ink">Target {displayMoney({ amount: alternative.target, currency: "USD" })} in {alternative.months} months</p></div><Badge tone="warn">Wallet approval required</Badge></div><p className="mt-3 text-sm text-ink-soft">{prepared.note}</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => void approve()} disabled={!configured || !loggedIn} busy={busy === "signing"}>{loggedIn ? "Approve on Monad" : "Sign in to approve"}</Button><Button variant="secondary" onClick={() => setPrepared(null)}>Keep exploring</Button></div></div> : <Button onClick={() => void prepare()} busy={busy === "preparing"}>Review plan update</Button>}</Card>

    <Notice tone="default" title="How Twin calculates this">{result.assumption} {result.alternative.assumptions[2]}</Notice>
    <Card padded={false}><details className="group p-5 sm:p-6"><summary className="cursor-pointer list-none font-semibold text-ink">Show calculation assumptions <span className="float-right text-ink-muted transition-transform group-open:rotate-180">⌄</span></summary><ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-soft">{result.alternative.assumptions.map((line) => <li key={line}>· {line}</li>)}</ul></details></Card>
  </div>;
}

function OutcomeCard({ title, outcome, accent = false }: { title: string; outcome: Outcome; accent?: boolean }) {
  return <div className={`rounded-2xl p-5 ${accent ? "bg-panel text-panel-ink" : "bg-sunken text-ink"}`}><div className={`text-sm font-semibold ${accent ? "text-panel-soft" : "text-ink-muted"}`}>{title}</div><div className="numeric mt-3 text-3xl font-semibold">{displayMoney(outcome.expected)}</div><div className={`mt-1 text-sm ${accent ? "text-panel-soft" : "text-ink-soft"}`}>expected balance</div><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className={accent ? "text-panel-soft" : "text-ink-muted"}>Downside path</dt><dd className="numeric font-semibold">{displayMoney(outcome.downside)}</dd></div><div className="flex justify-between gap-3"><dt className={accent ? "text-panel-soft" : "text-ink-muted"}>Required each month</dt><dd className="numeric font-semibold">{displayMoney(outcome.requiredMonthly)}</dd></div><div className="flex justify-between gap-3"><dt className={accent ? "text-panel-soft" : "text-ink-muted"}>Goal confidence</dt><dd className="font-semibold">{outcome.confidencePct}%</dd></div></dl>{outcome.reachesOnExpectedPath ? <Badge tone="ok" className="mt-5">Reaches goal on expected path</Badge> : <Badge tone="warn" className="mt-5">Shortfall on expected path</Badge>}</div>;
}
function toneFor(money: MoneyView): string { return Number(money.amount) >= 0 ? "text-ok" : "text-breach"; }
function toneForNeg(money: MoneyView): string { return Number(money.amount) <= 0 ? "text-ok" : "text-warn"; }
