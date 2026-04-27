"use client";

import { useEffect, useState } from "react";
import type { AttendanceEntry, Employee } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { paidHoursForEntry } from "@/lib/agent";

export default function AttendanceLog({ employer }: { employer: string }) {
  const [rows, setRows]         = useState<AttendanceEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  async function refresh() {
    const [a, e] = await Promise.all([
      fetch(`/api/attendance?employer=${employer}`).then((r) => r.json()),
      fetch(`/api/employees?employer=${employer}`).then((r) => r.json()),
    ]);
    setRows(Array.isArray(a) ? a : []);
    setEmployees(Array.isArray(e) ? e : []);
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [employer]);

  const nameOf = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? "Unknown";

  const sorted = [...rows].sort((a, b) => b.clockIn - a.clockIn).slice(0, 60);

  const open  = rows.filter((r) => !r.clockOut).length;
  const total = rows.length;

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base font-semibold">Attendance log</div>
          <div className="text-xs text-ink-500 mt-0.5">
            Paid hours: Mon–Fri, 09:00–17:00, capped at 8h/day.
            Records stored on 0G Storage.
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="pill bg-amber-100 text-amber-700">
            {open} clocked in
          </span>
          <span className="pill bg-slate-100 text-ink-500">
            {total} total entries
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-500 border-b border-slate-100">
            <tr>
              <th className="pb-2">Employee</th>
              <th>Clock in</th>
              <th>Clock out</th>
              <th>Paid hrs</th>
              <th>Storage ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-ink-400 text-sm">
                  No attendance records yet.
                </td>
              </tr>
            )}
            {sorted.map((r) => {
              const paid = r.clockOut ? paidHoursForEntry(r) : 0;
              return (
                <tr key={r.id}>
                  <td className="py-2.5 font-medium">{nameOf(r.employeeId)}</td>
                  <td className="text-ink-600">{dateTime(r.clockIn)}</td>
                  <td>
                    {r.clockOut ? (
                      <span className="text-ink-600">{dateTime(r.clockOut)}</span>
                    ) : (
                      <span className="pill bg-amber-100 text-amber-700">Open</span>
                    )}
                  </td>
                  <td className="font-mono">
                    {r.clockOut ? (
                      <span className={paid > 0 ? "text-brand-700 font-medium" : "text-ink-400"}>
                        {paid.toFixed(2)}h
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td
                    className="font-mono text-xs text-ink-400 truncate max-w-[160px]"
                    title={r.storageRef}
                  >
                    {r.storageRef ? r.storageRef.slice(0, 18) + "…" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
