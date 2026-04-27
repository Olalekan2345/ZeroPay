"use client";

import { useEffect, useState } from "react";
import type { Employee, AttendanceEntry } from "@/lib/types";
import { dateTime, short } from "@/lib/format";

type EditDraft = { name: string; hourlyRate: string };

export default function EmployeesPanel({ employer }: { employer: string }) {
  const [rows, setRows]       = useState<Employee[]>([]);
  const [attendance, setAtt]  = useState<AttendanceEntry[]>([]);
  const [form, setForm]       = useState({ name: "", wallet: "", hourlyRate: "" });
  const [busy, setBusy]       = useState<string | null>(null);
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);
  const [editId, setEditId]   = useState<string | null>(null);
  const [draft, setDraft]     = useState<EditDraft>({ name: "", hourlyRate: "" });

  async function refresh() {
    const [e, a] = await Promise.all([
      fetch(`/api/employees?employer=${employer}`).then((r) => r.json()),
      fetch(`/api/attendance?employer=${employer}`).then((r) => r.json()),
    ]);
    setRows(Array.isArray(e) ? e : []);
    setAtt(Array.isArray(a) ? a : []);
  }
  useEffect(() => { refresh(); }, [employer]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add"); setMsg(null);
    try {
      const res = await fetch(`/api/employees?employer=${employer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          wallet: form.wallet,
          hourlyRate: Number(form.hourlyRate),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      setForm({ name: "", wallet: "", hourlyRate: "" });
      await refresh();
      setMsg({ text: "Employee registered and saved to 0G Storage.", ok: true });
    } catch (err) {
      setMsg({ text: (err as Error).message, ok: false });
    } finally { setBusy(null); }
  }

  function startEdit(r: Employee) {
    setEditId(r.id);
    setDraft({ name: r.name, hourlyRate: String(r.hourlyRate) });
    setMsg(null);
  }

  async function saveEdit(id: string) {
    setBusy(`edit:${id}`); setMsg(null);
    try {
      const hourlyRate = Number(draft.hourlyRate);
      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0)
        throw new Error("Hourly rate must be a positive number.");
      if (!draft.name.trim())
        throw new Error("Name cannot be empty.");
      const res = await fetch(`/api/employees?employer=${employer}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: draft.name.trim(), hourlyRate }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      setEditId(null);
      await refresh();
      setMsg({ text: "Employee updated and saved to 0G Storage.", ok: true });
    } catch (err) {
      setMsg({ text: (err as Error).message, ok: false });
    } finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this employee? They can register as an employer afterwards.")) return;
    await fetch(`/api/employees?employer=${employer}&id=${id}`, { method: "DELETE" });
    await refresh();
  }

  async function clock(employeeId: string, action: "in" | "out") {
    setBusy(`${employeeId}:${action}`); setMsg(null);
    try {
      const res = await fetch(`/api/attendance?employer=${employer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      await refresh();
      setMsg({ text: `Clocked ${action} successfully.`, ok: true });
    } catch (err) {
      setMsg({ text: (err as Error).message, ok: false });
    } finally { setBusy(null); }
  }

  const openFor = (id: string) =>
    attendance.find((a) => a.employeeId === id && !a.clockOut);

  return (
    <div className="card p-6 space-y-6">
      <div>
        <div className="text-base font-semibold" style={{ color: "var(--c-fg)" }}>Team members</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--c-dim)" }}>
          Clock-in allowed Mon–Fri, 09:00–17:00 only. Edit name or rate anytime.
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={add} className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ada Lovelace" />
          </div>
          <div>
            <label className="label">Wallet address</label>
            <input className="input font-mono text-xs" value={form.wallet}
              onChange={(e) => setForm({ ...form, wallet: e.target.value })}
              placeholder="0x…" />
          </div>
          <div>
            <label className="label">Hourly rate (0G)</label>
            <input className="input" inputMode="decimal" value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              placeholder="0.01" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {msg && (
            <p className={`text-xs ${msg.ok ? "" : "text-red-400"}`}
              style={msg.ok ? { color: "var(--c-primary)" } : undefined}>
              {msg.text}
            </p>
          )}
          <button className="btn-primary ml-auto" disabled={busy === "add"}>
            {busy === "add" ? "Saving…" : "Add employee"}
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
              <th className="pb-2 text-left text-xs uppercase tracking-wide font-medium pl-1" style={{ color: "var(--c-dim)" }}>Name</th>
              <th className="pb-2 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--c-dim)" }}>Wallet</th>
              <th className="pb-2 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--c-dim)" }}>Rate</th>
              <th className="pb-2 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--c-dim)" }}>Status</th>
              <th className="pb-2 text-right text-xs uppercase tracking-wide font-medium pr-1" style={{ color: "var(--c-dim)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm" style={{ color: "var(--c-dim)" }}>
                  No employees yet. Add your first team member above.
                </td>
              </tr>
            )}

            {rows.map((r) => {
              const open      = openFor(r.id);
              const isEditing = editId === r.id;
              const isBusy    = busy === `edit:${r.id}`;

              if (isEditing) {
                return (
                  <tr key={r.id} style={{ background: "var(--c-bg-hover)" }}>
                    <td className="py-3 pl-1">
                      <input className="input text-xs w-36" value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        placeholder="Name" autoFocus />
                    </td>
                    <td className="font-mono text-xs" style={{ color: "var(--c-dim)" }}>
                      {short(r.wallet)}
                      <div className="text-[10px]" style={{ color: "var(--c-dim)" }}>wallet locked</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input className="input text-xs w-24" inputMode="decimal"
                          value={draft.hourlyRate}
                          onChange={(e) => setDraft({ ...draft, hourlyRate: e.target.value })}
                          placeholder="0G/hr" />
                        <span className="text-xs" style={{ color: "var(--c-dim)" }}>0G/hr</span>
                      </div>
                    </td>
                    <td>
                      {open
                        ? <span className="pill-amber">Clocked in</span>
                        : <span className="pill" style={{ background: "var(--c-bg-hover)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}>Off clock</span>
                      }
                    </td>
                    <td className="text-right pr-1">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => saveEdit(r.id)} disabled={isBusy} className="btn-primary text-xs">
                          {isBusy ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditId(null)} className="btn-ghost text-xs">Cancel</button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={r.id}
                  style={{ borderTop: "1px solid var(--c-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td className="py-3 pl-1 font-medium" style={{ color: "var(--c-fg)" }}>{r.name}</td>
                  <td className="font-mono text-xs" style={{ color: "var(--c-dim)" }}>{short(r.wallet)}</td>
                  <td>
                    <span className="font-medium" style={{ color: "var(--c-muted)" }}>{r.hourlyRate}</span>
                    <span className="text-xs ml-1" style={{ color: "var(--c-dim)" }}>0G/hr</span>
                  </td>
                  <td>
                    {open
                      ? <span className="pill-amber">Clocked in · {dateTime(open.clockIn).split(",")[1]?.trim()}</span>
                      : <span className="pill" style={{ background: "var(--c-bg-hover)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}>Off clock</span>
                    }
                  </td>
                  <td className="text-right pr-1">
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => startEdit(r)} className="btn-ghost text-xs px-2.5 py-1">Edit</button>
                      {open ? (
                        <button onClick={() => clock(r.id, "out")} disabled={!!busy} className="btn-ghost text-xs px-2.5 py-1">
                          Clock out
                        </button>
                      ) : (
                        <button onClick={() => clock(r.id, "in")} disabled={!!busy} className="btn-primary text-xs px-2.5 py-1">
                          Clock in
                        </button>
                      )}
                      <button onClick={() => remove(r.id)} className="btn-danger text-xs px-2.5 py-1">Remove</button>
                    </div>
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
