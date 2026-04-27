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
  const [err, setErr] = useState<string | null>(null);

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
      <div className="card p-10 text-center">
        <div className="text-xl font-semibold">Employee portal</div>
        <p className="text-ink-500 text-sm mt-2 max-w-md mx-auto">
          Connect the wallet that your employer registered to view your hours
          and payment history.
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="card p-10 text-center">
        <div className="text-xl font-semibold">Not registered</div>
        <p className="text-ink-500 text-sm mt-2">
          This wallet isn&apos;t registered as an employee. Ask your employer
          to add{" "}
          <span className="font-mono">{short(address)}</span>.
        </p>
      </div>
    );
  }

  if (!data) {
    return <div className="card p-10 text-center text-ink-500">Loading…</div>;
  }

  const sorted = [...data.attendance].sort((a, b) => b.clockIn - a.clockIn);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi {data.employee.name.split(" ")[0]} 👋
        </h1>
        <p className="text-ink-500 text-sm">
          {data.businessName ? `Employed at ${data.businessName}. ` : ""}
          Your hours and payments, read-only. Records are stored on 0G Storage.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Stat
          label="This week — hours"
          value={`${data.thisWeek.hoursWorked.toFixed(2)} h`}
        />
        <Stat
          label="This week — estimated"
          value={fmt0G(data.thisWeek.amountWei)}
          tone="ok"
        />
        <Stat label="Hourly rate" value={`${data.employee.hourlyRate} 0G/hr`} />
      </div>

      <div className="card p-6">
        <div className="text-sm font-semibold">My attendance</div>
        <div className="text-xs text-ink-500">Read-only — employer-logged.</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="py-2">Clock in</th>
                <th>Clock out</th>
                <th>Paid hours</th>
                <th>Storage</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-500">
                    No attendance yet.
                  </td>
                </tr>
              )}
              {sorted.slice(0, 40).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2">{dateTime(r.clockIn)}</td>
                  <td>
                    {r.clockOut ? (
                      dateTime(r.clockOut)
                    ) : (
                      <span className="pill bg-amber-100 text-amber-700">
                        Open
                      </span>
                    )}
                  </td>
                  <td>
                    {r.clockOut ? paidHoursForEntry(r).toFixed(2) : "—"}
                  </td>
                  <td
                    className="font-mono text-xs text-ink-500 truncate max-w-[160px]"
                    title={r.storageRef}
                  >
                    {r.storageRef ? r.storageRef.slice(0, 16) + "…" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-6">
        <div className="text-sm font-semibold">Payment history</div>
        <div className="text-xs text-ink-500">
          Paid each Saturday from the employer payroll pool.
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="py-2">Week of</th>
                <th>Hours</th>
                <th>Amount</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {data.history.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-500">
                    No payments yet.
                  </td>
                </tr>
              )}
              {data.history.map((h, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-2">
                    {new Date(h.weekStart).toLocaleDateString()}
                  </td>
                  <td>{h.hoursWorked.toFixed(2)}</td>
                  <td className="font-medium">{fmt0G(h.amountWei)}</td>
                  <td className="font-mono text-xs">
                    {h.txHash ? short(h.txHash) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  const toneCls =
    tone === "ok" ? "bg-brand-50 text-brand-700" : "bg-slate-50 text-ink-900";
  return (
    <div className={`rounded-xl p-5 ${toneCls}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
