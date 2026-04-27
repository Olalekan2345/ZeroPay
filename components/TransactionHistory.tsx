"use client";

import { useEffect, useState } from "react";
import { short, tokenToUSD } from "@/lib/format";
import { use0GPrice } from "@/lib/usePrice";

type Tx = {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  event: string;
  key: string;
  label: string;
  from?: string;
  to?: string;
  employee?: string;
  hoursWorked?: number;
  employeeCount?: number;
  totalPaid?: string;
  amount?: string;
};

const EXPLORER = process.env.NEXT_PUBLIC_ZG_EXPLORER ?? "https://chainscan-galileo.0g.ai";

const BADGE_STYLE: Record<string, { color: string; bg: string }> = {
  Deposit:         { color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  Withdrawal:      { color: "#fb923c", bg: "rgba(251,146,60,0.1)"  },
  Salary:          { color: "#9200e1", bg: "rgba(146,0,225,0.1)"   },
  "Batch payroll": { color: "#dd23bb", bg: "rgba(221,35,187,0.1)"  },
};

function Badge({ label }: { label: string }) {
  const s = BADGE_STYLE[label] ?? { color: "var(--c-muted)", bg: "var(--c-bg-hover)" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}30` }}
    >
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
  function fmtAmt(tokens: number) {
    const usd = tokenToUSD(tokens, price);
    return usd ? `${tokens.toFixed(4)} 0G  ≈ ${usd}` : `${tokens.toFixed(4)} 0G`;
  }

  let detail = "";
  if (tx.label === "Deposit")
    detail = `${fmtAmt(parseFloat(tx.amount!))}  from ${short(tx.from!)}`;
  else if (tx.label === "Withdrawal")
    detail = `${fmtAmt(parseFloat(tx.amount!))}  to ${short(tx.to!)}`;
  else if (tx.label === "Salary")
    detail = `${fmtAmt(parseFloat(tx.amount!))}  → ${short(tx.employee!)} (${tx.hoursWorked}h)`;
  else if (tx.label === "Batch payroll")
    detail = `${fmtAmt(parseFloat(tx.totalPaid!))}  to ${tx.employeeCount} employee${tx.employeeCount !== 1 ? "s" : ""}`;

  return (
    <div className="flex items-center justify-between gap-4 py-3 last:border-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
      <div className="flex items-center gap-3 min-w-0">
        <Badge label={tx.label} />
        <div className="min-w-0">
          <p className="text-sm truncate" style={{ color: "var(--c-muted)" }}>{detail}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>{fmt(tx.timestamp)}</p>
        </div>
      </div>
      <a
        href={`${EXPLORER}/tx/${tx.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-mono flex-shrink-0 transition-colors"
        style={{ color: "var(--c-primary)" }}
        title={tx.txHash}
      >
        {short(tx.txHash)} ↗
      </a>
    </div>
  );
}

const FILTERS = ["All", "Deposit", "Withdrawal", "Salary", "Batch payroll"];

export default function TransactionHistory({ employer }: { employer: string }) {
  const [txs, setTxs]         = useState<Tx[] | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("All");
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

  const visible = txs
    ? (filter === "All" ? txs : txs.filter((t) => t.label === filter))
    : [];

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--c-fg)" }}>Transaction History</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>On-chain events from your payroll pool contract</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs px-3 py-1.5">
          {loading ? "Loading…" : "↺ Refresh"}
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((l) => {
          const count = txs ? (l === "All" ? txs.length : txs.filter((t) => t.label === l).length) : null;
          const active = filter === l;
          return (
            <button
              key={l}
              onClick={() => setFilter(l)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)",
                      color: "#fff",
                      boxShadow: "0 0 10px rgba(146,0,225,0.25)",
                    }
                  : { background: "var(--c-bg-hover)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }
              }
            >
              {l}{count !== null && <span className="ml-1 opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* States */}
      {loading && (
        <div className="py-10 text-center text-sm animate-pulse" style={{ color: "var(--c-dim)" }}>
          Fetching on-chain events…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/25 px-4 py-3" style={{ background: "rgba(239,68,68,0.06)" }}>
          <p className="text-xs font-semibold text-red-400">Failed to load</p>
          <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--c-dim)" }}>
          No {filter === "All" ? "" : filter.toLowerCase() + " "}transactions found yet.
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div>
          {visible.map((tx) => (
            <TxRow key={tx.key} tx={tx} price={price} />
          ))}
        </div>
      )}
    </div>
  );
}
