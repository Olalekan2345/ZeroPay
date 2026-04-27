"use client";

import { useEffect, useRef, useState } from "react";
import type { PayrollReport, PayrollLine } from "@/lib/types";
import type { PaymentSchedule } from "@/lib/db";
import { fmt0G, tokenToUSD, short } from "@/lib/format";
import { use0GPrice } from "@/lib/usePrice";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from "wagmi";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";
import { zgGalileo } from "@/lib/chain";
import { WORK_START_HOUR, WORK_END_HOUR, MAX_DAILY_HOURS } from "@/lib/agent";

/* ── Types ── */
type Message = {
  from: "agent" | "system" | "tx";
  text: string;
  ts: number;
  lines?: PayrollLine[];
  txHash?: string;
  price?: number | null;
};

type SchedulerStatus = {
  configured: boolean;
  schedule?: PaymentSchedule;
  next?: { iso: string; label: string };
};

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2,"0")}:00`,
}));
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}${[,"st","nd","rd"][((i+1)%100<11||((i+1)%100>13))&&(i+1)%10<4?(i+1)%10:0]||"th"}`,
}));

/* ── Component ── */
export default function AgentPanel({ employer }: { employer: string }) {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [schedule, setSchedule]         = useState<PaymentSchedule>({
    frequency: "weekly", hour: 9, minute: 0, dayOfWeek: 6, dayOfMonth: 1,
  });
  const [cancellingSchedule, setCancellingSchedule] = useState(false);
  const [payNowBusy, setPayNowBusy]     = useState(false);
  const [payNowResult, setPayNowResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingSched, setSavingSched]         = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [period, setPeriod]                   = useState<"daily" | "weekly">("weekly");
  const [offset, setOffset]                   = useState<0 | -1>(0);
  const [report, setReport]                   = useState<PayrollReport | null>(null);
  const [poolAddress, setPoolAddress]         = useState<`0x${string}` | null>(null);
  const [running, setRunning]                 = useState(false);
  const [txHash, setTxHash]                   = useState<`0x${string}` | undefined>();
  const bottomRef                             = useRef<HTMLDivElement>(null);
  const { address, chainId }                  = useAccount();
  const { switchChainAsync }                  = useSwitchChain();
  const { writeContractAsync, isPending }     = useWriteContract();
  const { isLoading: waiting, isSuccess }     = useWaitForTransactionReceipt({ hash: txHash });

  function push(msg: Omit<Message, "ts">) {
    setMessages((p) => [...p, { ...msg, ts: Date.now() }]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }

  async function loadSettings() {
    const r = await fetch(`/api/settings?employer=${employer}`, { cache: "no-store" });
    const s = await r.json();
    if (s.paymentSchedule) setSchedule({ minute: 0, dayOfWeek: 6, dayOfMonth: 1, ...s.paymentSchedule });
    return s;
  }

  async function loadSchedulerStatus() {
    const r = await fetch(`/api/scheduler/status?employer=${employer}`, { cache: "no-store" });
    setSchedulerStatus(await r.json());
  }

  async function loadPool() {
    const r = await fetch(`/api/pool?employer=${employer}`, { cache: "no-store" });
    const p = await r.json();
    setPoolAddress(p?.address ?? null);
    return p?.address ?? null;
  }

  useEffect(() => {
    loadSchedulerStatus();
    const t = setInterval(loadSchedulerStatus, 60_000);
    return () => clearInterval(t);
  }, [employer]);

  useEffect(() => {
    Promise.all([loadSettings(), loadPool()]).then(([s]) => {
      const freq = s.paymentSchedule?.frequency ?? "weekly";
      setPeriod(freq);
      push({
        from: "agent",
        text:
          `ZeroPay AI Agent online.\n\n` +
          `Payroll rules:\n` +
          `  • Workdays: Monday → Friday\n` +
          `  • Work window: ${WORK_START_HOUR}:00 – ${WORK_END_HOUR}:00\n` +
          `  • Max paid hours/day: ${MAX_DAILY_HOURS}h\n` +
          `  • Weekends automatically excluded\n` +
          `  • Clock-in blocked outside work hours\n\n` +
          `Payment schedule: ${freq === "daily" ? "Daily" : "Weekly"}.\n` +
          `Configure the schedule below, then click "Run agent" to compute and pay salaries from the Secured Vault.`,
      });
    });
  }, [employer]);

  useEffect(() => {
    if (isSuccess && txHash) {
      push({ from: "tx", text: "Transaction confirmed on-chain ✓", txHash });
    }
  }, [isSuccess]);

  async function saveSchedule() {
    setSavingSched(true);
    const res = await fetch(`/api/settings?employer=${employer}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentSchedule: schedule }),
    });
    const s = await res.json();
    if (s.paymentSchedule) {
      setSchedule(s.paymentSchedule);
      setPeriod(s.paymentSchedule.frequency);
    }
    setSavingSched(false);
    setScheduleEditing(false);
    await loadSchedulerStatus();
    const t = `${String(schedule.hour).padStart(2,"0")}:${String(schedule.minute ?? 0).padStart(2,"0")}`;
    const schedLabel = schedule.frequency === "daily"
      ? `Daily at ${t}`
      : schedule.frequency === "monthly"
      ? `Monthly on the ${DAY_OF_MONTH_OPTIONS[(schedule.dayOfMonth ?? 1) - 1]?.label} at ${t}`
      : `Every ${DAY_NAMES[schedule.dayOfWeek ?? 6]} at ${t}`;
    push({
      from: "agent",
      text: `Schedule updated: ${schedLabel}.\n\nThe scheduler will automatically execute payroll at this time. Salary payments are deducted exclusively from the pool — not your wallet.`,
    });
  }

  async function cancelSchedule() {
    setCancellingSchedule(true);
    await fetch(`/api/settings?employer=${employer}`, { method: "DELETE" });
    setCancellingSchedule(false);
    await loadSchedulerStatus();
    push({ from: "agent", text: "Automatic payment schedule cancelled. Use Set Schedule to configure a new one." });
  }

  async function payNow() {
    setPayNowBusy(true);
    setPayNowResult(null);
    try {
      const res = await fetch(`/api/payroll/run?employer=${employer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekOffset: offset, period }),
      });
      const body = await res.json();
      if (body.txHash) {
        setPayNowResult({ ok: true, text: `Payment sent ✓  tx: ${body.txHash}` });
      } else if (body.error === "insufficient_pool") {
        setPayNowResult({ ok: false, text: `Insufficient pool balance — deposit more 0G first.` });
      } else if (body.warnings?.includes("No payable hours for this period.") || body.lines?.every((l: any) => l.amountWei === "0")) {
        setPayNowResult({ ok: false, text: "No payable hours for this period." });
      } else if (!res.ok) {
        setPayNowResult({ ok: false, text: body.error ?? "Payment failed." });
      } else {
        setPayNowResult({ ok: true, text: `Done — ${body.totalPaid} 0G paid to ${body.lines?.filter((l: any) => BigInt(l.amountWei) > 0n).length ?? 0} employee(s).` });
      }
    } catch (e) {
      setPayNowResult({ ok: false, text: (e as Error).message });
    } finally {
      setPayNowBusy(false);
    }
  }

  async function runAgent() {
    if (running || isPending || waiting) return;
    setRunning(true);
    const pa = poolAddress ?? (await loadPool());

    const periodLabel = period === "daily" ? "today" : "this week";
    push({ from: "system", text: `— Run started ${new Date().toLocaleString()} —` });
    push({ from: "agent", text: `Fetching attendance records from 0G Storage index…` });

    const r = await fetch(
      `/api/payroll/preview?employer=${employer}&weekOffset=${offset}&period=${period}`,
      { cache: "no-store" },
    );
    const rep: PayrollReport = await r.json();
    setReport(rep);

    const rangeStart = new Date(rep.weekStart).toLocaleDateString();
    const rangeEnd   = new Date(rep.weekEnd).toLocaleDateString();
    const rangeLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart} → ${rangeEnd}`;

    const fmtWithUsd = (wei: string) => {
      const base = fmt0G(wei);
      const usd = tokenToUSD(Number(BigInt(wei)) / 1e18, price);
      return usd ? `${base} (≈${usd})` : base;
    };
    push({
      from: "agent",
      text:
        `Attendance aggregated for ${rangeLabel}.\n\n` +
        `Pool balance:  ${fmtWithUsd(rep.poolBalanceWei)}\n` +
        `Total owed:    ${fmtWithUsd(rep.totalPaidWei)}\n` +
        `Funds OK:      ${rep.sufficient ? "✓ Yes" : "✗ No — fund the pool"}`,
      lines: rep.lines.filter((l) => l.hoursWorked > 0),
      price,
    });

    if (rep.warnings.length > 0)
      push({ from: "agent", text: `Warnings:\n${rep.warnings.map((w) => `⚠ ${w}`).join("\n")}` });

    const payable = rep.lines.filter((l) => BigInt(l.amountWei) > 0n);
    if (payable.length === 0) {
      push({ from: "agent", text: `No payable hours for ${periodLabel}. Nothing to submit.` });
      setRunning(false);
      return;
    }
    if (!rep.sufficient) {
      push({ from: "agent", text: "Vault underfunded — add more 0G tokens in the Overview tab." });
      setRunning(false);
      return;
    }
    if (!pa) {
      push({ from: "agent", text: "No Secured Vault configured. Deploy or link one in the Overview tab." });
      setRunning(false);
      return;
    }
    if (!address) {
      push({ from: "agent", text: "No wallet connected. Connect your employer wallet to sign." });
      setRunning(false);
      return;
    }

    push({ from: "agent", text: "Saving payroll report to 0G Storage…" });
    const saveRes = await fetch(`/api/payroll/save?employer=${employer}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekOffset: offset, period }),
    });
    const saved = await saveRes.json();
    push({ from: "agent", text: `Report stored → ${saved.storageRef ?? "—"}` });
    push({ from: "agent", text: `Submitting payBatch for ${payable.length} employee(s)…` });

    try {
      if (chainId !== zgGalileo.id) {
        try { await switchChainAsync({ chainId: zgGalileo.id }); }
        catch {
          push({ from: "agent", text: "Could not switch to 0G Galileo. Please switch manually in your wallet." });
          setRunning(false);
          return;
        }
      }

      // gas cap skips eth_estimateGas simulation — required for 0G Galileo RPC
      const gasLimit = BigInt(100_000 + payable.length * 80_000);
      const hash = await writeContractAsync({
        address: pa,
        abi: PAYROLL_POOL_ABI,
        functionName: "payBatch",
        chainId: zgGalileo.id,
        gas: gasLimit,
        args: [
          payable.map((l) => l.wallet),
          payable.map((l) => BigInt(l.amountWei)),
          payable.map((l) => BigInt(Math.round(l.hoursWorked * 100))),
          BigInt(Math.floor(rep.weekStart / 1000)),
          saved.storageRef ?? "",
        ],
      });
      setTxHash(hash);
      push({ from: "tx", text: "Transaction submitted — awaiting confirmation…", txHash: hash });
      await fetch(`/api/payroll/save?employer=${employer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekOffset: offset, period, txHash: hash, storageRef: saved.storageRef }),
      });
    } catch (e) {
      push({ from: "agent", text: `Error: ${(e as Error).message}` });
    } finally {
      setRunning(false);
    }
  }

  const price = use0GPrice();
  const busy = running || isPending || waiting;

  return (
    <div className="space-y-4">
      {/* ── Schedule config ── */}
      <div className="card p-5 space-y-5 dark:bg-gray-900">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold dark:text-white">Automatic payment schedule</div>
            <div className="text-xs text-ink-400 dark:text-gray-500 mt-0.5">
              The scheduler will execute payroll automatically at the time you set.
            </div>
          </div>
          {schedulerStatus?.next && (
            <div className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 font-semibold whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse inline-block" />
              {schedulerStatus.next.label}
            </div>
          )}
        </div>

        {/* Frequency pills */}
        <div>
          <label className="label mb-2">Frequency</label>
          <div className="flex gap-2">
            {(["daily","weekly","monthly"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSchedule((s) => ({ ...s, frequency: f }))}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  schedule.frequency === f
                    ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                    : "bg-white dark:bg-gray-800 text-ink-500 dark:text-gray-400 border-slate-200 dark:border-gray-700 hover:border-brand-400 hover:text-brand-600"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Day picker — weekly or monthly */}
        <div className="grid sm:grid-cols-2 gap-4">
          {schedule.frequency === "weekly" && (
            <div>
              <label className="label mb-2">Pay day</label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setSchedule((s) => ({ ...s, dayOfWeek: i }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      (schedule.dayOfWeek ?? 6) === i
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white dark:bg-gray-800 text-ink-500 dark:text-gray-400 border-slate-200 dark:border-gray-700 hover:border-brand-400 hover:text-brand-600"
                    }`}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {schedule.frequency === "monthly" && (
            <div>
              <label className="label mb-2">Day of month</label>
              <select
                className="input w-auto"
                value={schedule.dayOfMonth ?? 1}
                onChange={(e) => setSchedule((s) => ({ ...s, dayOfMonth: Number(e.target.value) }))}
              >
                {DAY_OF_MONTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Time picker */}
          <div>
            <label className="label mb-2">Execution time</label>
            <input
              type="time"
              className="input w-auto"
              value={`${String(schedule.hour).padStart(2,"0")}:${String(schedule.minute ?? 0).padStart(2,"0")}`}
              onChange={(e) => {
                const [hStr, mStr] = e.target.value.split(":");
                const h = parseInt(hStr, 10);
                const m = parseInt(mStr, 10);
                setSchedule((s) => ({
                  ...s,
                  hour:   isNaN(h) ? s.hour   : h,
                  minute: isNaN(m) ? s.minute  : m,
                }));
              }}
            />
          </div>
        </div>

        {/* Summary + actions */}
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-gray-800">
          <p className="text-sm text-ink-500 dark:text-gray-400">
            {(() => {
              const t = `${String(schedule.hour).padStart(2,"0")}:${String(schedule.minute ?? 0).padStart(2,"0")}`;
              if (schedule.frequency === "daily")
                return `Runs every day at ${t}`;
              if (schedule.frequency === "monthly")
                return `Runs on the ${DAY_OF_MONTH_OPTIONS[(schedule.dayOfMonth ?? 1) - 1]?.label} of each month at ${t}`;
              return `Runs every ${DAY_NAMES[schedule.dayOfWeek ?? 6]} at ${t}`;
            })()}
          </p>
          <div className="flex gap-2">
            {schedulerStatus?.schedule && (
              <button
                onClick={cancelSchedule}
                disabled={cancellingSchedule || savingSched}
                className="btn-ghost text-xs text-red-500 hover:text-red-600 border-red-200 dark:border-red-800"
              >
                {cancellingSchedule ? "Cancelling…" : "Cancel Schedule"}
              </button>
            )}
            <button
              onClick={saveSchedule}
              disabled={savingSched || cancellingSchedule}
              className="btn-primary"
            >
              {savingSched ? "Saving…" : "Set Schedule"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Pay Now ── */}
      <div className="card p-5 space-y-3 dark:bg-gray-900">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="text-sm font-semibold dark:text-white">Pay Now</div>
            <div className="text-xs text-ink-500 dark:text-gray-400">
              Immediately execute payroll and send salaries from the pool.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="input w-auto text-xs"
              value={period}
              onChange={(e) => setPeriod(e.target.value as "daily" | "weekly" | "monthly")}
              disabled={payNowBusy}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select
              className="input w-auto text-xs"
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value) as 0 | -1)}
              disabled={payNowBusy}
            >
              <option value={0}>{period === "daily" ? "Today" : period === "monthly" ? "This month" : "This week"}</option>
              <option value={-1}>{period === "daily" ? "Yesterday" : period === "monthly" ? "Last month" : "Last week"}</option>
            </select>
            <button
              onClick={payNow}
              disabled={payNowBusy || busy}
              className="btn-primary flex items-center gap-2"
            >
              {payNowBusy ? <><Spinner />Processing…</> : "Pay Now"}
            </button>
          </div>
        </div>
        {payNowResult && (
          <p className={`text-xs font-medium break-all rounded-lg px-3 py-2 ${
            payNowResult.ok
              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}>
            {payNowResult.text}
          </p>
        )}
      </div>

      {/* ── Run controls ── */}
      <div className="card p-5 flex flex-wrap gap-3 items-center justify-between dark:bg-gray-900">
        <div>
          <div className="text-sm font-semibold dark:text-white">Manual run</div>
          <div className="text-xs text-ink-500 dark:text-gray-400">
            Reads 0G Storage records, enforces rules, pays from pool only.
            Your wallet pays gas; vault pays salaries.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="input w-auto text-xs"
            value={period}
            onChange={(e) => setPeriod(e.target.value as "daily" | "weekly" | "monthly")}
            disabled={busy}
          >
            <option value="daily">Daily payout</option>
            <option value="weekly">Weekly payout</option>
            <option value="monthly">Monthly payout</option>
          </select>
          <select
            className="input w-auto text-xs"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value) as 0 | -1)}
            disabled={busy}
          >
            <option value={0}>{period === "daily" ? "Today" : period === "monthly" ? "This month" : "This week"}</option>
            <option value={-1}>{period === "daily" ? "Yesterday" : period === "monthly" ? "Last month" : "Last week"}</option>
          </select>
          <button onClick={runAgent} disabled={busy} className="btn-primary">
            {busy ? (
              <span className="flex items-center gap-2"><Spinner />Running…</span>
            ) : "Run agent"}
          </button>
        </div>
      </div>

      {/* ── Chat log ── */}
      <div className="card overflow-hidden flex flex-col dark:bg-gray-900" style={{ minHeight: 480 }}>
        <div className="px-5 py-3 border-b border-slate-100 dark:border-gray-800 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-gray-400">
            Agent log
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m, i) => <Bubble key={i} msg={m} price={price} />)}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-ink-500 dark:text-gray-400">
              <Spinner />Agent working…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Payroll breakdown ── */}
      {report && report.lines.some((l) => l.hoursWorked > 0) && (
        <div className="card p-6 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold dark:text-white">
              Payroll breakdown ·{" "}
              {new Date(report.weekStart).toLocaleDateString()}
              {report.weekStart !== report.weekEnd
                ? ` → ${new Date(report.weekEnd).toLocaleDateString()}`
                : ""}
            </div>
            <a
              href={`/api/payroll/export?employer=${employer}&weekOffset=${offset}`}
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
            >
              Export CSV
            </a>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-500 dark:text-gray-400 border-b border-slate-100 dark:border-gray-800">
              <tr>
                <th className="pb-3">Employee</th>
                <th>Wallet</th>
                <th>Hours</th>
                <th>Rate</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
              {report.lines.map((l) => (
                <tr key={l.employeeId}>
                  <td className="py-3 font-medium dark:text-white">{l.employeeName}</td>
                  <td className="font-mono text-xs text-ink-500 dark:text-gray-400">{short(l.wallet)}</td>
                  <td className="dark:text-gray-300">{l.hoursWorked.toFixed(2)}h</td>
                  <td className="text-ink-400 dark:text-gray-500">{l.hourlyRate} 0G/hr</td>
                  <td className="text-right font-semibold dark:text-white">
                    {fmt0G(l.amountWei)}
                    {tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price) && (
                      <div className="text-xs font-normal text-ink-400 dark:text-gray-500">
                        ≈{tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price)}
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    {BigInt(l.amountWei) > 0n
                      ? <span className="pill bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Paid</span>
                      : <span className="pill bg-slate-100 text-ink-500 dark:bg-gray-800 dark:text-gray-400">No hours</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 dark:border-gray-700">
              <tr>
                <td colSpan={4} className="pt-3 text-xs uppercase text-ink-500 dark:text-gray-400 font-semibold">
                  Total
                </td>
                <td className="pt-3 text-right font-bold dark:text-white">
                  {fmt0G(report.totalPaidWei)}
                  {tokenToUSD(Number(BigInt(report.totalPaidWei)) / 1e18, price) && (
                    <div className="text-xs font-normal text-ink-400 dark:text-gray-500">
                      ≈{tokenToUSD(Number(BigInt(report.totalPaidWei)) / 1e18, price)}
                    </div>
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Message bubbles ── */
function Bubble({ msg, price }: { msg: Message; price: number | null }) {
  if (msg.from === "system") {
    return (
      <div className="text-center text-xs text-ink-400 dark:text-gray-500 py-1">
        {msg.text}
      </div>
    );
  }
  if (msg.from === "tx") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 text-sm">🔗</div>
        <div className="flex-1">
          <div className="rounded-2xl rounded-tl-sm bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 px-4 py-3 text-sm dark:text-blue-200">
            {msg.text}
            {msg.txHash && (
              <div className="mt-1 font-mono text-xs text-blue-600 dark:text-blue-400 break-all">{msg.txHash}</div>
            )}
          </div>
          <div className="text-xs text-ink-400 dark:text-gray-500 mt-1 ml-2">{new Date(msg.ts).toLocaleTimeString()}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-emerald-700 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold flex-shrink-0">
        AI
      </div>
      <div className="flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 px-4 py-3 text-sm whitespace-pre-wrap dark:text-gray-100">
          {msg.text}
          {msg.lines && msg.lines.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {msg.lines.map((l) => {
                const usd = tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price);
                return (
                  <div key={l.employeeId}
                    className="flex justify-between text-xs bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-700 rounded-lg px-3 py-2">
                    <span className="font-medium dark:text-white">{l.employeeName}</span>
                    <span className="text-ink-500 dark:text-gray-400">{l.hoursWorked.toFixed(2)}h</span>
                    <span className="font-semibold text-brand-700 dark:text-brand-400">
                      {fmt0G(l.amountWei)}
                      {usd && <span className="ml-1 font-normal text-ink-400 dark:text-gray-500">≈{usd}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="text-xs text-ink-400 dark:text-gray-500 mt-1 ml-2">{new Date(msg.ts).toLocaleTimeString()}</div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}
