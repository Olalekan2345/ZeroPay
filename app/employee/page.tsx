"use client";

import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { dateTime, fmt0G, short } from "@/lib/format";
import { paidHoursForEntry } from "@/lib/agent";
import type { AttendanceEntry, Employee, PayrollLine } from "@/lib/types";

type Payload = {
  employer: string;
  businessName: string | null;
  employee: Employee;
  attendance: AttendanceEntry[];
  thisWeek: PayrollLine;
  lastWeek: PayrollLine;
  weekBounds: { weekStart: number; weekEnd: number };
  history: {
    weekStart: number;
    weekEnd: number;
    amount: number;
    amountWei: string;
    hoursWorked: number;
    txHash?: string;
    storageRef?: string;
  }[];
  error?: string;
};

export default function EmployeePage() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setErr(null);
    setData(null);
    fetch(`/api/employee?wallet=${address.toLowerCase()}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "failed");
        setData(j);
      })
      .catch((e) => setErr((e as Error).message));
  }, [address]);

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="card p-10 text-center space-y-4">
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl"
            style={{
              background: "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)",
              boxShadow: "0 0 20px rgba(146,0,225,0.3)",
            }}
          >
            👤
          </div>
          <div>
            <div className="text-xl font-semibold" style={{ color: "var(--c-fg)" }}>Employee portal</div>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--c-muted)" }}>
              Connect the wallet your employer registered to view your hours and payment history.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="card p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl"
            style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)" }}>
            ⚠️
          </div>
          <div>
            <div className="text-xl font-semibold" style={{ color: "var(--c-fg)" }}>Not registered</div>
            <p className="text-sm mt-2" style={{ color: "var(--c-muted)" }}>
              Wallet{" "}
              <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                style={{ background: "var(--c-bg-hover)", color: "var(--c-fg)" }}>
                {short(address)}
              </span>{" "}
              isn&apos;t registered as an employee. Ask your employer to add you.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-10 text-center text-sm animate-pulse" style={{ color: "var(--c-dim)" }}>
        Loading…
      </div>
    );
  }

  const sorted = [...data.attendance].sort((a, b) => b.clockIn - a.clockIn);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--c-fg)" }}>
          Hi {data.employee.name.split(" ")[0]} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
          {data.businessName ? `Employed at ${data.businessName} · ` : ""}
          Read-only view — records on 0G Storage.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="This week — hours"     value={`${data.thisWeek.hoursWorked.toFixed(2)} h`} />
        <StatCard label="This week — estimated" value={fmt0G(data.thisWeek.amountWei)} accent />
        <StatCard label="Hourly rate"           value={`${data.employee.hourlyRate} 0G/hr`} />
      </div>

      {/* Attendance */}
      <div className="card p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>My attendance</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>Read-only — logged by employer.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-zg w-full">
            <thead>
              <tr>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Paid hours</th>
                <th>Storage ref</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center" style={{ color: "var(--c-dim)" }}>No attendance yet.</td>
                </tr>
              )}
              {sorted.slice(0, 40).map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.clockIn)}</td>
                  <td>
                    {r.clockOut ? dateTime(r.clockOut) : (
                      <span className="pill-amber">Open</span>
                    )}
                  </td>
                  <td>{r.clockOut ? paidHoursForEntry(r).toFixed(2) : "—"}</td>
                  <td className="font-mono text-xs truncate max-w-[160px]" style={{ color: "var(--c-dim)" }} title={r.storageRef}>
                    {r.storageRef ? r.storageRef.slice(0, 16) + "…" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history */}
      <div className="card p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--c-fg)" }}>Payment history</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>Paid from the employer payroll pool on schedule.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-zg w-full">
            <thead>
              <tr>
                <th>Period</th>
                <th>Hours</th>
                <th>Amount</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {data.history.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center" style={{ color: "var(--c-dim)" }}>No payments yet.</td>
                </tr>
              )}
              {data.history.map((h, i) => (
                <tr key={i}>
                  <td>{new Date(h.weekStart).toLocaleDateString()}</td>
                  <td>{h.hoursWorked.toFixed(2)}</td>
                  <td className="font-semibold" style={{ color: "var(--c-primary)" }}>{fmt0G(h.amountWei)}</td>
                  <td className="font-mono text-xs" style={{ color: "var(--c-dim)" }}>{h.txHash ? short(h.txHash) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-5 transition-all duration-200"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-bg-card)")}>
      <div className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--c-dim)" }}>{label}</div>
      <div
        className="text-2xl font-bold mt-2"
        style={accent ? { color: "var(--c-primary)" } : { color: "var(--c-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}
