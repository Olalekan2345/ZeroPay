"use client";

import { useEffect, useRef, useState } from "react";
import type { PayrollReport, PayrollLine, Employee } from "@/lib/types";
import type { PaymentSchedule } from "@/lib/db";
import { fmt0G, tokenToUSD, short } from "@/lib/format";
import { use0GPrice } from "@/lib/usePrice";
import { WORK_START_HOUR, WORK_END_HOUR, MAX_DAILY_HOURS } from "@/lib/agent";

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
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}${[,"st","nd","rd"][((i+1)%100<11||((i+1)%100>13))&&(i+1)%10<4?(i+1)%10:0]||"th"}`,
}));

const GRADIENT = "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)";

export default function AgentPanel({ employer }: { employer: string }) {
  const [messages, setMessages]               = useState<Message[]>([]);
  const [schedule, setSchedule]               = useState<PaymentSchedule>({
    frequency: "weekly", hour: 9, minute: 0, dayOfWeek: 6, dayOfMonth: 1,
  });
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [cancellingSchedule, setCancellingSchedule] = useState(false);
  const [payNowBusy, setPayNowBusy]           = useState(false);
  const [payNowResult, setPayNowResult]       = useState<{ ok: boolean; text: string } | null>(null);
  const [savingSched, setSavingSched]         = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [period, setPeriod]                   = useState<"daily" | "weekly" | "monthly">("weekly");
  const [offset, setOffset]                   = useState<0 | -1>(0);
  const [report, setReport]                   = useState<PayrollReport | null>(null);
  const [running, setRunning]                 = useState(false);
  const [employees, setEmployees]             = useState<Employee[]>([]);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const bottomRef                             = useRef<HTMLDivElement>(null);
  const price                                 = use0GPrice();

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

  useEffect(() => {
    fetch(`/api/employees?employer=${employer}`)
      .then((r) => r.json())
      .then((list) => {
        const emps: Employee[] = Array.isArray(list) ? list : [];
        setEmployees(emps);
        setSelectedIds(new Set(emps.map((e) => e.id)));
      });
  }, [employer]);

  useEffect(() => {
    loadSchedulerStatus();
    const t = setInterval(loadSchedulerStatus, 60_000);
    return () => clearInterval(t);
  }, [employer]);

  useEffect(() => {
    loadSettings().then((s) => {
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
          `Payment schedule: ${freq === "daily" ? "Daily" : freq === "monthly" ? "Monthly" : "Weekly"}.\n` +
          `Salaries are sent directly from the agent wallet to each employee's address. Fund the agent wallet in the Overview tab.`,
      });
    });
  }, [employer]);

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
      text: `Schedule updated: ${schedLabel}.\n\nThe agent will automatically execute payroll at this time and pay salaries directly from the agent wallet.`,
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
        body: JSON.stringify({
          weekOffset: offset,
          period,
          employeeIds: selectedIds.size < employees.length ? [...selectedIds] : undefined,
        }),
      });
      const body = await res.json();
      if (body.txHash) {
        setPayNowResult({ ok: true, text: `Payment sent ✓  tx: ${body.txHash}` });
      } else if (body.error === "insufficient_pool") {
        setPayNowResult({ ok: false, text: `Insufficient agent wallet balance — send more 0G to the agent wallet first.` });
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
    if (running) return;
    setRunning(true);

    const periodLabel = period === "daily" ? "today" : period === "monthly" ? "this month" : "this week";
    push({ from: "system", text: `— Run started ${new Date().toLocaleString()} —` });
    push({ from: "agent", text: `Fetching attendance records…` });

    const filteredIds = selectedIds.size < employees.length ? [...selectedIds] : null;
    const previewUrl  = `/api/payroll/preview?employer=${employer}&weekOffset=${offset}&period=${period}`
      + (filteredIds ? `&employeeIds=${filteredIds.join(",")}` : "");

    const r   = await fetch(previewUrl, { cache: "no-store" });
    const rep: PayrollReport = await r.json();
    setReport(rep);

    const rangeStart = new Date(rep.weekStart).toLocaleDateString();
    const rangeEnd   = new Date(rep.weekEnd).toLocaleDateString();
    const rangeLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart} → ${rangeEnd}`;

    const fmtWithUsd = (wei: string) => {
      const base = fmt0G(wei);
      const usd  = tokenToUSD(Number(BigInt(wei)) / 1e18, price);
      return usd ? `${base} (≈${usd})` : base;
    };

    push({
      from: "agent",
      text:
        `Attendance aggregated for ${rangeLabel}.\n\n` +
        `Agent wallet balance:  ${fmtWithUsd(rep.poolBalanceWei)}\n` +
        `Total owed:            ${fmtWithUsd(rep.totalPaidWei)}\n` +
        `Funds OK:              ${rep.sufficient ? "✓ Yes" : "✗ No — fund the agent wallet"}`,
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
      push({ from: "agent", text: "Agent wallet underfunded — add more 0G tokens in the Overview tab." });
      setRunning(false);
      return;
    }

    push({ from: "agent", text: `Sending ${payable.length} direct payment(s) from agent wallet…` });

    try {
      const runRes = await fetch(`/api/payroll/run?employer=${employer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekOffset: offset,
          period,
          employeeIds: filteredIds ?? undefined,
        }),
      });
      const result: PayrollReport & { error?: string } = await runRes.json();

      if (!runRes.ok || result.error) {
        push({ from: "agent", text: `Error: ${result.error ?? "Payment failed."}` });
      } else if (result.txHash) {
        push({ from: "tx", text: "Payments confirmed on-chain ✓", txHash: result.txHash });
      } else {
        push({ from: "agent", text: "Payroll processed. Check the History tab for details." });
      }
    } catch (e) {
      push({ from: "agent", text: `Error: ${(e as Error).message}` });
    } finally {
      setRunning(false);
    }
  }

  /* ── Helpers ── */
  function schedSummary() {
    const t = `${String(schedule.hour).padStart(2,"0")}:${String(schedule.minute ?? 0).padStart(2,"0")}`;
    if (schedule.frequency === "daily")   return `Every day at ${t}`;
    if (schedule.frequency === "monthly") return `${DAY_OF_MONTH_OPTIONS[(schedule.dayOfMonth ?? 1) - 1]?.label} of each month at ${t}`;
    return `Every ${DAY_NAMES[schedule.dayOfWeek ?? 6]} at ${t}`;
  }

  function periodLabel(p: typeof period, o: 0 | -1) {
    if (p === "daily")   return o === -1 ? "Yesterday"  : "Today";
    if (p === "monthly") return o === -1 ? "Last month" : "This month";
    return o === -1 ? "Last week" : "This week";
  }

  function FreqPill({ val, label }: { val: "daily" | "weekly" | "monthly"; label: string }) {
    const active = schedule.frequency === val;
    return (
      <button
        onClick={() => setSchedule((s) => ({ ...s, frequency: val }))}
        className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 border"
        style={active
          ? { background: GRADIENT, color: "#fff", border: "1px solid transparent", boxShadow: "0 0 12px rgba(146,0,225,0.3)" }
          : { background: "var(--c-bg-hover)", color: "var(--c-muted)", borderColor: "var(--c-border)" }
        }
      >
        {label}
      </button>
    );
  }

  function DayPill({ day, idx }: { day: string; idx: number }) {
    const active = (schedule.dayOfWeek ?? 6) === idx;
    return (
      <button
        onClick={() => setSchedule((s) => ({ ...s, dayOfWeek: idx }))}
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border"
        style={active
          ? { background: GRADIENT, color: "#fff", border: "1px solid transparent" }
          : { background: "var(--c-bg-hover)", color: "var(--c-muted)", borderColor: "var(--c-border)" }
        }
      >
        {day.slice(0, 3)}
      </button>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Schedule config ── */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>Automatic payment schedule</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>
              The agent executes payroll automatically and sends salaries directly from the agent wallet.
            </div>
          </div>
          {schedulerStatus?.next && (
            <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
              style={{ color: "var(--c-primary)" }}>
              <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ background: "var(--c-primary)" }} />
              {schedulerStatus.next.label}
            </div>
          )}
        </div>

        <div>
          <label className="label mb-2">Frequency</label>
          <div className="flex gap-2 flex-wrap">
            <FreqPill val="daily"   label="Daily"   />
            <FreqPill val="weekly"  label="Weekly"  />
            <FreqPill val="monthly" label="Monthly" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {schedule.frequency === "weekly" && (
            <div>
              <label className="label mb-2">Pay day</label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((d, i) => <DayPill key={i} day={d} idx={i} />)}
              </div>
            </div>
          )}
          {schedule.frequency === "monthly" && (
            <div>
              <label className="label mb-2">Day of month</label>
              <select
                value={schedule.dayOfMonth ?? 1}
                onChange={(e) => setSchedule((s) => ({ ...s, dayOfMonth: Number(e.target.value) }))}
                className="text-xs"
              >
                {DAY_OF_MONTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
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

        <div className="flex items-center justify-between gap-4 pt-1 flex-wrap" style={{ borderTop: "1px solid var(--c-border)" }}>
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>{schedSummary()}</p>
          <div className="flex gap-2">
            {schedulerStatus?.schedule && (
              <button
                onClick={cancelSchedule}
                disabled={cancellingSchedule || savingSched}
                className="btn-danger text-xs px-3 py-1.5"
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

      {/* ── Employee selection ── */}
      {employees.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>Select employees to pay</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>
                Only checked employees will be included in the next payment run.
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <button onClick={() => setSelectedIds(new Set(employees.map((e) => e.id)))} style={{ color: "var(--c-primary)" }}>
                Select all
              </button>
              <span style={{ color: "var(--c-border-s)" }}>·</span>
              <button onClick={() => setSelectedIds(new Set())} style={{ color: "var(--c-dim)" }}>
                Clear all
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {employees.map((emp) => {
              const checked = selectedIds.has(emp.id);
              return (
                <label
                  key={emp.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                  style={{
                    background: checked ? "var(--c-bg-hover)" : "transparent",
                    border: `1px solid ${checked ? "var(--c-border-s)" : "transparent"}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(emp.id);
                      else next.delete(emp.id);
                      setSelectedIds(next);
                    }}
                    className="w-4 h-4 flex-shrink-0 rounded"
                    style={{ accentColor: "var(--c-primary)" }}
                  />
                  <span className="text-sm font-medium flex-1" style={{ color: checked ? "var(--c-fg)" : "var(--c-muted)" }}>
                    {emp.name}
                  </span>
                  <span className="text-xs" style={{ color: "var(--c-dim)" }}>{emp.hourlyRate} 0G/hr</span>
                </label>
              );
            })}
          </div>
          {selectedIds.size === 0 && (
            <p className="text-xs text-amber-400 px-1">No employees selected — payment will be skipped.</p>
          )}
        </div>
      )}

      {/* ── Pay Now ── */}
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>Pay Now</div>
            <div className="text-xs" style={{ color: "var(--c-dim)" }}>
              Immediately execute payroll — salaries sent directly from the agent wallet.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select className="text-xs" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} disabled={payNowBusy}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select className="text-xs" value={offset} onChange={(e) => setOffset(Number(e.target.value) as 0 | -1)} disabled={payNowBusy}>
              <option value={0}>{periodLabel(period, 0)}</option>
              <option value={-1}>{periodLabel(period, -1)}</option>
            </select>
            <button
              onClick={payNow}
              disabled={payNowBusy || running || selectedIds.size === 0}
              className="btn-primary flex items-center gap-2"
            >
              {payNowBusy
                ? <><Spinner />Processing…</>
                : selectedIds.size === 0
                ? "No employees selected"
                : selectedIds.size < employees.length
                ? `Pay ${selectedIds.size} employee${selectedIds.size !== 1 ? "s" : ""}`
                : "Pay Now"}
            </button>
          </div>
        </div>
        {payNowResult && (
          <p className={`text-xs font-medium break-all rounded-xl px-3 py-2 ${payNowResult.ok ? "" : "text-red-400"}`}
            style={payNowResult.ok
              ? { color: "var(--c-primary)", background: "var(--c-primary-glow)", border: "1px solid var(--c-border-s)" }
              : { background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }
            }>
            {payNowResult.text}
          </p>
        )}
      </div>

      {/* ── Run agent (verbose log) ── */}
      <div className="card p-5 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>Manual run</div>
          <div className="text-xs" style={{ color: "var(--c-dim)" }}>
            Shows a full agent log — previews amounts, then sends payments from the agent wallet.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="text-xs" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} disabled={running}>
            <option value="daily">Daily payout</option>
            <option value="weekly">Weekly payout</option>
            <option value="monthly">Monthly payout</option>
          </select>
          <select className="text-xs" value={offset} onChange={(e) => setOffset(Number(e.target.value) as 0 | -1)} disabled={running}>
            <option value={0}>{periodLabel(period, 0)}</option>
            <option value={-1}>{periodLabel(period, -1)}</option>
          </select>
          <button
            onClick={runAgent}
            disabled={running || payNowBusy || selectedIds.size === 0}
            className="btn-primary"
          >
            {running
              ? <span className="flex items-center gap-2"><Spinner />Running…</span>
              : selectedIds.size === 0
              ? "No employees selected"
              : selectedIds.size < employees.length
              ? `Run for ${selectedIds.size} employee${selectedIds.size !== 1 ? "s" : ""}`
              : "Run agent"}
          </button>
        </div>
      </div>

      {/* ── Chat log ── */}
      <div className="card overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--c-primary)" }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--c-dim)" }}>
            Agent log
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m, i) => <Bubble key={i} msg={m} price={price} />)}
          {running && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--c-dim)" }}>
              <Spinner />Agent working…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Payroll breakdown ── */}
      {report && report.lines.some((l) => l.hoursWorked > 0) && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>
              Payroll breakdown ·{" "}
              {new Date(report.weekStart).toLocaleDateString()}
              {report.weekStart !== report.weekEnd
                ? ` → ${new Date(report.weekEnd).toLocaleDateString()}`
                : ""}
            </div>
            <a
              href={`/api/payroll/export?employer=${employer}&weekOffset=${offset}`}
              className="text-xs transition-colors"
              style={{ color: "var(--c-primary)" }}
            >
              Export CSV
            </a>
          </div>
          <table className="table-zg w-full">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Wallet</th>
                <th>Hours</th>
                <th>Rate</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.lines.map((l) => (
                <tr key={l.employeeId}>
                  <td className="font-medium">{l.employeeName}</td>
                  <td className="font-mono text-xs" style={{ color: "var(--c-dim)" }}>{short(l.wallet)}</td>
                  <td style={{ color: "var(--c-muted)" }}>{l.hoursWorked.toFixed(2)}h</td>
                  <td className="text-xs" style={{ color: "var(--c-dim)" }}>{l.hourlyRate} 0G/hr</td>
                  <td className="text-right">
                    <span className="font-semibold" style={{ color: "var(--c-fg)" }}>{fmt0G(l.amountWei)}</span>
                    {tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price) && (
                      <div className="text-xs font-normal" style={{ color: "var(--c-dim)" }}>
                        ≈{tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price)}
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    {BigInt(l.amountWei) > 0n
                      ? <span className="pill-cyan text-xs">Paid</span>
                      : <span className="pill text-xs" style={{ background: "var(--c-bg-hover)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}>No hours</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "1px solid var(--c-border)" }}>
                <td colSpan={4} className="pt-3 text-xs uppercase font-semibold" style={{ color: "var(--c-dim)" }}>Total</td>
                <td className="pt-3 text-right font-bold" style={{ color: "var(--c-fg)" }}>
                  {fmt0G(report.totalPaidWei)}
                  {tokenToUSD(Number(BigInt(report.totalPaidWei)) / 1e18, price) && (
                    <div className="text-xs font-normal" style={{ color: "var(--c-dim)" }}>
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

function Bubble({ msg, price }: { msg: Message; price: number | null }) {
  if (msg.from === "system") {
    return <div className="text-center text-xs py-1" style={{ color: "var(--c-dim)" }}>{msg.text}</div>;
  }
  if (msg.from === "tx") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
          style={{ background: "var(--c-bg-hover)", border: "1px solid var(--c-border-s)" }}>
          🔗
        </div>
        <div className="flex-1">
          <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm"
            style={{ color: "var(--c-primary)", background: "var(--c-primary-glow)", border: "1px solid var(--c-border-s)" }}>
            {msg.text}
            {msg.txHash && (
              <div className="mt-1 font-mono text-xs break-all" style={{ color: "var(--c-muted)" }}>{msg.txHash}</div>
            )}
          </div>
          <div className="text-xs mt-1 ml-2" style={{ color: "var(--c-dim)" }}>{new Date(msg.ts).toLocaleTimeString()}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
        style={{ background: "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)", boxShadow: "0 0 12px rgba(146,0,225,0.3)" }}>
        AI
      </div>
      <div className="flex-1">
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm whitespace-pre-wrap"
          style={{ color: "var(--c-muted)", background: "var(--c-bg-hover)", border: "1px solid var(--c-border)" }}>
          {msg.text}
          {msg.lines && msg.lines.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {msg.lines.map((l) => {
                const usd = tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price);
                return (
                  <div key={l.employeeId}
                    className="flex justify-between text-xs rounded-xl px-3 py-2"
                    style={{ background: "var(--c-bg-card)", border: "1px solid var(--c-border)" }}>
                    <span className="font-medium" style={{ color: "var(--c-fg)" }}>{l.employeeName}</span>
                    <span style={{ color: "var(--c-dim)" }}>{l.hoursWorked.toFixed(2)}h</span>
                    <span className="font-semibold" style={{ color: "var(--c-primary)" }}>
                      {fmt0G(l.amountWei)}
                      {usd && <span className="ml-1 font-normal" style={{ color: "var(--c-dim)" }}>≈{usd}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="text-xs mt-1 ml-2" style={{ color: "var(--c-dim)" }}>{new Date(msg.ts).toLocaleTimeString()}</div>
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
