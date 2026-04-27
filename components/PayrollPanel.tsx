"use client";

import { useEffect, useState } from "react";
import type { PayrollReport } from "@/lib/types";
import { fmt0G, tokenToUSD, short } from "@/lib/format";
import { use0GPrice } from "@/lib/usePrice";

type Period = "daily" | "weekly" | "monthly";

export default function PayrollPanel({ employer }: { employer: string }) {
  const [history, setHistory]               = useState<PayrollReport[]>([]);
  const [loading, setLoading]               = useState(true);
  const [preview, setPreview]               = useState<PayrollReport | null>(null);
  const [previewPeriod, setPreviewPeriod]   = useState<Period>("weekly");
  const [previewOffset, setPreviewOffset]   = useState<0 | -1>(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const price = use0GPrice();

  async function loadHistory() {
    setLoading(true);
    const r = await fetch(`/api/payroll/reports?employer=${employer}`, { cache: "no-store" });
    const j = await r.json();
    setHistory(Array.isArray(j) ? j : []);
    setLoading(false);
  }

  async function loadPreview(period: Period, offset: 0 | -1) {
    setPreviewLoading(true);
    try {
      const r = await fetch(
        `/api/payroll/preview?employer=${employer}&period=${period}&weekOffset=${offset}`,
        { cache: "no-store" },
      );
      setPreview(await r.json());
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => { loadHistory(); }, [employer]);
  useEffect(() => { loadPreview(previewPeriod, previewOffset); }, [employer, previewPeriod, previewOffset]);

  function periodLabel(p: Period, offset: 0 | -1) {
    if (p === "daily")   return offset === -1 ? "Yesterday"  : "Today";
    if (p === "monthly") return offset === -1 ? "Last month" : "This month";
    return offset === -1 ? "Last week" : "This week";
  }

  function rangeLabel(r: PayrollReport) {
    const s = new Date(r.weekStart).toLocaleDateString();
    const e = new Date(r.weekEnd).toLocaleDateString();
    return s === e ? s : `${s} → ${e}`;
  }

  function usd(wei: string) {
    return tokenToUSD(Number(BigInt(wei)) / 1e18, price);
  }

  return (
    <div className="space-y-6">

      {/* ── Live preview ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-base font-semibold" style={{ color: "var(--c-fg)" }}>Payroll preview</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>
              Live calculation — updates as attendance changes. Not saved until payment runs.
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              className="text-xs"
              value={previewPeriod}
              onChange={(e) => setPreviewPeriod(e.target.value as Period)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select
              className="text-xs"
              value={previewOffset}
              onChange={(e) => setPreviewOffset(Number(e.target.value) as 0 | -1)}
            >
              <option value={0}>{periodLabel(previewPeriod, 0)}</option>
              <option value={-1}>{periodLabel(previewPeriod, -1)}</option>
            </select>
            <button onClick={() => loadPreview(previewPeriod, previewOffset)} disabled={previewLoading} className="btn-ghost text-xs px-3 py-1.5">
              {previewLoading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
        </div>

        {preview && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--c-dim)" }}>{rangeLabel(preview)}</span>
              <div className="text-right">
                <span className="text-xl font-bold" style={{ color: "var(--c-fg)" }}>{fmt0G(preview.totalPaidWei)}</span>
                {usd(preview.totalPaidWei) && (
                  <div className="text-xs" style={{ color: "var(--c-dim)" }}>≈ {usd(preview.totalPaidWei)}</div>
                )}
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="space-y-1">
                {preview.warnings.map((w, i) => (
                  <p key={i}
                    className="text-xs text-amber-400 rounded-xl px-3 py-2"
                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
                  >
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}

            {preview.lines.filter((l) => l.hoursWorked > 0).length > 0 ? (
              <table className="table-zg w-full">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Hours</th>
                    <th>Rate</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.filter((l) => l.hoursWorked > 0).map((l) => (
                    <tr key={l.employeeId}>
                      <td className="font-medium">{l.employeeName}</td>
                      <td style={{ color: "var(--c-muted)" }}>{l.hoursWorked.toFixed(2)}h</td>
                      <td className="text-xs" style={{ color: "var(--c-dim)" }}>{l.hourlyRate} 0G/hr</td>
                      <td className="text-right">
                        <span className="font-semibold" style={{ color: "var(--c-fg)" }}>{fmt0G(l.amountWei)}</span>
                        {usd(l.amountWei) && (
                          <div className="text-xs font-normal" style={{ color: "var(--c-dim)" }}>≈ {usd(l.amountWei)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-center py-4" style={{ color: "var(--c-dim)" }}>
                No payable hours for this period.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Saved reports ── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-base font-semibold" style={{ color: "var(--c-fg)" }}>Payment history</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>All completed payroll runs stored on 0G Storage.</div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadHistory} disabled={loading} className="btn-ghost text-xs px-3 py-1.5">
              {loading ? "Loading…" : "↺ Refresh"}
            </button>
            <a href={`/api/payroll/export?employer=${employer}&weekOffset=0`} className="btn-ghost text-xs px-3 py-1.5">
              Export CSV
            </a>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm animate-pulse" style={{ color: "var(--c-dim)" }}>Loading…</div>
        ) : history.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--c-dim)" }}>
            No payment runs yet. Use the AI Agent tab to run payroll.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((r, i) => {
              const paid = r.lines.filter((l) => BigInt(l.amountWei) > 0n);
              return (
                <div
                  key={i}
                  className="rounded-xl p-5 space-y-3 transition-colors"
                  style={{ background: "var(--c-bg-card)", border: "1px solid var(--c-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-bg-card)")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>{rangeLabel(r)}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>
                        {paid.length} employee(s) paid · {new Date(r.generatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold" style={{ color: "var(--c-fg)" }}>{fmt0G(r.totalPaidWei)}</div>
                      {usd(r.totalPaidWei) && (
                        <div className="text-xs" style={{ color: "var(--c-dim)" }}>≈ {usd(r.totalPaidWei)}</div>
                      )}
                      {r.txHash
                        ? <span className="pill-cyan text-xs mt-1">On-chain</span>
                        : <span className="pill text-xs mt-1" style={{ background: "var(--c-bg-hover)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}>Draft</span>
                      }
                    </div>
                  </div>

                  <div>
                    {r.lines.map((l) => (
                      <div key={l.employeeId} className="flex items-center justify-between py-2 text-sm" style={{ borderTop: "1px solid var(--c-border)" }}>
                        <div>
                          <span className="font-medium" style={{ color: "var(--c-fg)" }}>{l.employeeName}</span>
                          <span className="ml-2 text-xs" style={{ color: "var(--c-dim)" }}>
                            {l.hoursWorked.toFixed(2)}h × {l.hourlyRate} 0G/hr
                          </span>
                        </div>
                        <span className="font-medium" style={{ color: "var(--c-muted)" }}>
                          {fmt0G(l.amountWei)}
                          {usd(l.amountWei) && (
                            <span className="ml-1 text-xs font-normal" style={{ color: "var(--c-dim)" }}>≈ {usd(l.amountWei)}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs pt-1" style={{ color: "var(--c-dim)" }}>
                    {r.txHash && (
                      <span>Tx: <span className="font-mono" style={{ color: "var(--c-muted)" }}>{short(r.txHash)}</span></span>
                    )}
                    {r.storageRef && (
                      <span title={r.storageRef}>
                        0G ref: <span className="font-mono" style={{ color: "var(--c-muted)" }}>{r.storageRef.slice(0, 20)}…</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
