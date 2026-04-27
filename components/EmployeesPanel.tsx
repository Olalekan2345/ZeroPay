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

  /* ── Add employee ── */
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

  /* ── Start editing ── */
  function startEdit(r: Employee) {
    setEditId(r.id);
    setDraft({ name: r.name, hourlyRate: String(r.hourlyRate) });
    setMsg(null);
  }

  /* ── Save edit ── */
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

  /* ── Remove ── */
  async function remove(id: string) {
    if (!confirm("Remove this employee? They can register as an employer afterwards.")) return;
    await fetch(`/api/employees?employer=${employer}&id=${id}`, { method: "DELETE" });
    await refresh();
  }

  /* ── Clock ── */
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
    <div className="card p-6 space-y-6 dark:bg-gray-900">
      {/* Header */}
      <div>
        <div className="text-base font-semibold dark:text-white">Team members</div>
        <div className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
          Clock-in allowed Mon–Fri, 09:00–17:00 only. Edit name or rate anytime.
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={add} className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Full name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ada Lovelace"
            />
          </div>
          <div>
            <label className="label">Wallet address</label>
            <input
              className="input font-mono text-xs"
              value={form.wallet}
              onChange={(e) => setForm({ ...form, wallet: e.target.value })}
              placeholder="0x…"
            />
          </div>
          <div>
            <label className="label">Hourly rate (0G)</label>
            <input
              className="input"
              inputMode="decimal"
              value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              placeholder="0.01"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {msg && (
            <p className={`text-xs ${msg.ok ? "text-brand-700 dark:text-brand-400" : "text-red-500"}`}>
              {msg.text}
            </p>
          )}
          <button className="btn-primary ml-auto" disabled={busy === "add"}>
            {busy === "add" ? "Saving…" : "Add employee"}
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-xs uppercase text-ink-500 dark:text-gray-400
              border-b border-slate-100 dark:border-gray-800">
            <tr>
              <th className="pb-2 pl-1">Name</th>
              <th>Wallet</th>
              <th>Rate</th>
              <th>Status</th>
              <th className="text-right pr-1">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-gray-800/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-ink-400 dark:text-gray-500 text-sm">
                  No employees yet. Add your first team member above.
                </td>
              </tr>
            )}

            {rows.map((r) => {
              const open       = openFor(r.id);
              const isEditing  = editId === r.id;
              const isBusy     = busy === `edit:${r.id}`;

              if (isEditing) {
                /* ── Inline edit row ── */
                return (
                  <tr key={r.id} className="bg-brand-50/40 dark:bg-brand-900/10">
                    <td className="py-3 pl-1">
                      <input
                        className="input text-xs w-36"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        placeholder="Name"
                        autoFocus
                      />
                    </td>
                    <td className="font-mono text-xs text-ink-400 dark:text-gray-500">
                      {short(r.wallet)}
                      <div className="text-[10px] text-ink-300 dark:text-gray-600">wallet locked</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input
                          className="input text-xs w-24"
                          inputMode="decimal"
                          value={draft.hourlyRate}
                          onChange={(e) => setDraft({ ...draft, hourlyRate: e.target.value })}
                          placeholder="0G/hr"
                        />
                        <span className="text-xs text-ink-400 dark:text-gray-500 whitespace-nowrap">0G/hr</span>
                      </div>
                    </td>
                    <td>
                      {open ? (
                        <span className="pill bg-amber-100 text-amber-700">Clocked in</span>
                      ) : (
                        <span className="pill bg-slate-100 text-ink-500 dark:bg-gray-800 dark:text-gray-400">
                          Off clock
                        </span>
                      )}
                    </td>
                    <td className="text-right pr-1">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => saveEdit(r.id)}
                          disabled={isBusy}
                          className="btn-primary text-xs"
                        >
                          {isBusy ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="btn-ghost text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              /* ── Normal row ── */
              return (
                <tr key={r.id}>
                  <td className="py-3 pl-1 font-medium dark:text-white">{r.name}</td>
                  <td className="font-mono text-xs text-ink-500 dark:text-gray-400">
                    {short(r.wallet)}
                  </td>
                  <td className="dark:text-gray-300">
                    <span className="font-medium">{r.hourlyRate}</span>
                    <span className="text-ink-400 dark:text-gray-500 text-xs ml-1">0G/hr</span>
                  </td>
                  <td>
                    {open ? (
                      <span className="pill bg-amber-100 text-amber-700">
                        Clocked in · {dateTime(open.clockIn).split(",")[1]?.trim()}
                      </span>
                    ) : (
                      <span className="pill bg-slate-100 text-ink-500 dark:bg-gray-800 dark:text-gray-400">
                        Off clock
                      </span>
                    )}
                  </td>
                  <td className="text-right pr-1">
                    <div className="flex gap-1.5 justify-end">
                      {/* Edit */}
                      <button
                        onClick={() => startEdit(r)}
                        className="btn-ghost text-xs"
                      >
                        Edit
                      </button>

                      {/* Clock in/out */}
                      {open ? (
                        <button
                          onClick={() => clock(r.id, "out")}
                          disabled={!!busy}
                          className="btn-ghost text-xs"
                        >
                          Clock out
                        </button>
                      ) : (
                        <button
                          onClick={() => clock(r.id, "in")}
                          disabled={!!busy}
                          className="btn-primary text-xs"
                        >
                          Clock in
                        </button>
                      )}

                      {/* Remove */}
                      <button
                        onClick={() => remove(r.id)}
                        className="btn-ghost text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
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
