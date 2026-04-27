"use client";

import { useEffect, useState } from "react";
import type { PayrollReport } from "@/lib/types";
import { fmt0G, tokenToUSD, short } from "@/lib/format";
import { use0GPrice } from "@/lib/usePrice";

type Period = "daily" | "weekly" | "monthly";

export default function PayrollPanel({ employer }: { employer: string }) {
  const [history, setHistory]   = useState<PayrollReport[]>([]);
  const [loading, setLoading]   = useState(true);
  const [preview, setPreview]   = useState<PayrollReport | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<Period>("weekly");
  const [previewOffset, setPreviewOffset] = useState<0 | -1>(0);
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
    if (p === "daily")   return offset === -1 ? "Yesterday"   : "Today";
    if (p === "monthly") return offset === -1 ? "Last month"  : "This month";
    return offset === -1 ? "Last week" : "This week";
  }

  function rangeLabel(r: PayrollReport) {
    const s = new Date(r.weekStart).toLocaleDateString();
    const e = new Date(r.weekEnd).toLocaleDateString();
    return s === e ? s : `${s} → ${e}`;
  }

  return (
    <div className="space-y-6">

      {/* ── Live preview ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-base font-semibold dark:text-white">Payroll preview</div>
            <div className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
              Live calculation — updates as attendance changes. Not saved until payment runs.
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              className="input w-auto text-xs"
              value={previewPeriod}
              onChange={(e) => setPreviewPeriod(e.target.value as Period)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select
              className="input w-auto text-xs"
              value={previewOffset}
              onChange={(e) => setPreviewOffset(Number(e.target.value) as 0 | -1)}
            >
              <option value={0}>{periodLabel(previewPeriod, 0)}</option>
              <option value={-1}>{periodLabel(previewPeriod, -1)}</option>
            </select>
            <button onClick={() => loadPreview(previewPeriod, previewOffset)} disabled={previewLoading} className="btn-ghost text-xs">
              {previewLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {preview && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-400 dark:text-gray-500">{rangeLabel(preview)}</span>
              <div className="text-right">
                <span className="text-lg font-bold dark:text-white">{fmt0G(preview.totalPaidWei)}</span>
                {tokenToUSD(Number(BigInt(preview.totalPaidWei)) / 1e18, price) && (
                  <div className="text-xs text-ink-400 dark:text-gray-500">
                    ≈{tokenToUSD(Number(BigInt(preview.totalPaidWei)) / 1e18, price)}
                  </div>
                )}
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="space-y-1">
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}

            {preview.lines.filter((l) => l.hoursWorked > 0).length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-500 dark:text-gray-400 border-b border-slate-100 dark:border-gray-800">
                  <tr>
                    <th className="pb-2">Employee</th>
                    <th>Hours</th>
                    <th>Rate</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
                  {preview.lines.filter((l) => l.hoursWorked > 0).map((l) => (
                    <tr key={l.employeeId}>
                      <td className="py-2 font-medium dark:text-white">{l.employeeName}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-ink-400 dark:text-gray-500 text-center py-4">
                No payable hours for this period.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Saved reports ── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold dark:text-white">Payment history</div>
            <div className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
              All completed payroll runs stored on 0G Storage.
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadHistory} disabled={loading} className="btn-ghost text-xs">
              {loading ? "Loading…" : "Refresh"}
            </button>
            <a href={`/api/payroll/export?employer=${employer}&weekOffset=0`} className="btn-ghost text-xs">
              Export CSV
            </a>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-ink-400 dark:text-gray-500 text-sm">Loading…</div>
        ) : history.length === 0 ? (
          <div className="py-10 text-center text-ink-400 dark:text-gray-500 text-sm">
            No payment runs yet. Use the AI Agent tab to run payroll.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((r, i) => {
              const paid = r.lines.filter((l) => BigInt(l.amountWei) > 0n);
              return (
                <div key={i} className="rounded-xl border border-slate-100 dark:border-gray-800 p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold dark:text-white">{rangeLabel(r)}</div>
                      <div className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
                        {paid.length} employee(s) paid · {new Date(r.generatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold dark:text-white">{fmt0G(r.totalPaidWei)}</div>
                      {tokenToUSD(Number(BigInt(r.totalPaidWei)) / 1e18, price) && (
                        <div className="text-xs text-ink-400 dark:text-gray-500">
                          ≈{tokenToUSD(Number(BigInt(r.totalPaidWei)) / 1e18, price)}
                        </div>
                      )}
                      {r.txHash
                        ? <span className="pill bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 text-xs">On-chain</span>
                        : <span className="pill bg-slate-100 text-ink-500 dark:bg-gray-800 dark:text-gray-400 text-xs">Draft</span>
                      }
                    </div>
                  </div>

                  <div className="divide-y divide-slate-50 dark:divide-gray-800">
                    {r.lines.map((l) => (
                      <div key={l.employeeId} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <span className="font-medium dark:text-white">{l.employeeName}</span>
                          <span className="ml-2 text-xs text-ink-400 dark:text-gray-500">
                            {l.hoursWorked.toFixed(2)}h × {l.hourlyRate} 0G/hr
                          </span>
                        </div>
                        <span className="font-medium dark:text-white">
                          {fmt0G(l.amountWei)}
                          {tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price) && (
                            <span className="ml-1 text-xs font-normal text-ink-400 dark:text-gray-500">
                              ≈{tokenToUSD(Number(BigInt(l.amountWei)) / 1e18, price)}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-ink-400 dark:text-gray-500 pt-1">
                    {r.txHash && (
                      <span>Tx: <span className="font-mono">{short(r.txHash)}</span></span>
                    )}
                    {r.storageRef && (
                      <span title={r.storageRef}>0G ref: <span className="font-mono">{r.storageRef.slice(0, 20)}…</span></span>
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
