"use client";

import { useEffect, useState } from "react";
import type { AttendanceEntry, Employee } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { paidHoursForEntry } from "@/lib/agent";

export default function AttendanceLog({ employer }: { employer: string }) {
  const [rows, setRows]           = useState<AttendanceEntry[]>([]);
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
  const open   = rows.filter((r) => !r.clockOut).length;
  const total  = rows.length;

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-base font-semibold" style={{ color: "var(--c-fg)" }}>Attendance log</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>
            Paid hours: Mon–Fri, 09:00–17:00, capped at 8h/day · records on 0G Storage.
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          {open > 0 && <span className="pill-amber">{open} clocked in</span>}
          <span className="pill" style={{ background: "var(--c-bg-hover)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}>
            {total} entries
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table-zg w-full min-w-[580px]">
          <thead>
            <tr>
              {["Employee", "Clock in", "Clock out", "Paid hrs", "Storage ref"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm" style={{ color: "var(--c-dim)" }}>
                  No attendance records yet.
                </td>
              </tr>
            )}
            {sorted.map((r) => {
              const paid = r.clockOut ? paidHoursForEntry(r) : 0;
              return (
                <tr key={r.id}>
                  <td className="font-medium">{nameOf(r.employeeId)}</td>
                  <td style={{ color: "var(--c-muted)" }}>{dateTime(r.clockIn)}</td>
                  <td>
                    {r.clockOut
                      ? <span style={{ color: "var(--c-muted)" }}>{dateTime(r.clockOut)}</span>
                      : <span className="pill-amber">Open</span>
                    }
                  </td>
                  <td className="font-mono">
                    {r.clockOut
                      ? <span style={{ color: paid > 0 ? "var(--c-primary)" : "var(--c-dim)" }}>{paid.toFixed(2)}h</span>
                      : <span style={{ color: "var(--c-dim)" }}>—</span>
                    }
                  </td>
                  <td className="font-mono text-xs truncate max-w-[160px]" style={{ color: "var(--c-dim)" }} title={r.storageRef}>
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
