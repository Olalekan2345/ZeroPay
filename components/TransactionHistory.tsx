"use client";

import { useEffect, useState } from "react";
import { short, tokenToUSD } from "@/lib/format";
import { use0GPrice } from "@/lib/usePrice";

type Tx = {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  event: string;
  label: string;
  // Funded
  from?: string;
  // Withdrawn
  to?: string;
  // SalaryPaid
  employee?: string;
  hoursWorked?: number;
  // BatchSettled
  employeeCount?: number;
  totalPaid?: string;
  // shared
  amount?: string;
};

const EXPLORER = process.env.NEXT_PUBLIC_ZG_EXPLORER ?? "https://chainscan-galileo.0g.ai";

const BADGE: Record<string, string> = {
  Deposit:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Withdrawal:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Salary:        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Batch payroll": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

function Badge({ label }: { label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[label] ?? "bg-slate-100 text-slate-600"}`}>
      {label}
    </span>
  );
}

function fmt(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function TxRow({ tx, price }: { tx: Tx; price: number | null }) {
  const explorerUrl = `${EXPLORER}/tx/${tx.txHash}`;

  function fmtAmt(tokens: number) {
    const usd = tokenToUSD(tokens, price);
    return usd ? `${tokens.toFixed(4)} 0G (≈${usd})` : `${tokens.toFixed(4)} 0G`;
  }

  let detail = "";
  if (tx.label === "Deposit")
    detail = `${fmtAmt(parseFloat(tx.amount!))} from ${short(tx.from!)}`;
  else if (tx.label === "Withdrawal")
    detail = `${fmtAmt(parseFloat(tx.amount!))} to ${short(tx.to!)}`;
  else if (tx.label === "Salary")
    detail = `${fmtAmt(parseFloat(tx.amount!))} → ${short(tx.employee!)} (${tx.hoursWorked}h)`;
  else if (tx.label === "Batch payroll")
    detail = `${fmtAmt(parseFloat(tx.totalPaid!))} to ${tx.employeeCount} employee${tx.employeeCount !== 1 ? "s" : ""}`;

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <Badge label={tx.label} />
        <div className="min-w-0">
          <p className="text-sm font-medium dark:text-white truncate">{detail}</p>
          <p className="text-xs text-ink-400 dark:text-gray-500">{fmt(tx.timestamp)}</p>
        </div>
      </div>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0"
        title={tx.txHash}
      >
        {short(tx.txHash)} ↗
      </a>
    </div>
  );
}

export default function TransactionHistory({ employer }: { employer: string }) {
  const [txs, setTxs]         = useState<Tx[] | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<string>("All");
  const price                 = use0GPrice();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/transactions?employer=${employer}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to load");
      setTxs(j.txs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [employer]);

  const labels = ["All", "Deposit", "Withdrawal", "Salary", "Batch payroll"];
  const visible = txs
    ? (filter === "All" ? txs : txs.filter((t) => t.label === filter))
    : [];

  return (
    <div className="card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold dark:text-white">Transaction History</h2>
          <p className="text-xs text-ink-400 dark:text-gray-500 mt-0.5">
            On-chain events from your payroll pool contract
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-ghost text-xs"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {labels.map((l) => (
          <button
            key={l}
            onClick={() => setFilter(l)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === l
                ? "bg-brand-600 text-white"
                : "bg-slate-100 dark:bg-gray-800 text-ink-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700"
            }`}
          >
            {l}
            {txs && l !== "All" && (
              <span className="ml-1 opacity-70">
                ({txs.filter((t) => t.label === l).length})
              </span>
            )}
            {txs && l === "All" && (
              <span className="ml-1 opacity-70">({txs.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div className="py-10 text-center text-ink-400 dark:text-gray-500 text-sm">
          Fetching on-chain events…
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">Failed to load</p>
          <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{error}</p>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="py-10 text-center text-ink-400 dark:text-gray-500 text-sm">
          No {filter === "All" ? "" : filter.toLowerCase() + " "}transactions found yet.
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div>
          {visible.map((tx) => (
            <TxRow key={`${tx.txHash}-${tx.event}`} tx={tx} price={price} />
          ))}
        </div>
      )}
    </div>
  );
}
