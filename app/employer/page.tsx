"use client";

import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import Link from "next/link";
import EmployeesPanel from "@/components/EmployeesPanel";
import AttendanceLog from "@/components/AttendanceLog";
import PayrollPanel from "@/components/PayrollPanel";
import AgentPanel from "@/components/AgentPanel";
import BusinessHeader from "@/components/BusinessHeader";
import TransactionHistory from "@/components/TransactionHistory";
import { short } from "@/lib/format";

type Who =
  | { role: "employer"; tenantExists: boolean }
  | { role: "employee"; employers: { employer: string; businessName: string | null; employeeName: string }[] };

type Tab = "overview" | "team" | "attendance" | "agent" | "payroll" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",   label: "Overview"   },
  { id: "team",       label: "Team"       },
  { id: "attendance", label: "Attendance" },
  { id: "agent",      label: "AI Agent"   },
  { id: "payroll",    label: "Reports"    },
  { id: "history",    label: "History"    },
];

export default function EmployerPage() {
  const { address, isConnected } = useAccount();
  const [who, setWho] = useState<Who | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!address) return;
    setWho(null); setErr(null);
    fetch(`/api/whoami?wallet=${address.toLowerCase()}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "failed"); setWho(j); })
      .catch((e) => setErr((e as Error).message));
  }, [address]);

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="card p-10 text-center space-y-5">
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-glow"
            style={{ background: "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)" }}
          >
            Z
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--c-fg)" }}>Employer dashboard</h1>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--c-muted)" }}>
              Connect a wallet to open your payroll dashboard.
              Any new wallet automatically gets a fresh isolated tenant.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (err) return <div className="card p-10 text-center text-red-500 text-sm">{err}</div>;

  if (!who) return (
    <div className="card p-10 text-center text-sm animate-pulse" style={{ color: "var(--c-dim)" }}>
      Checking access…
    </div>
  );

  if (who.role === "employee") {
    const biz = who.employers[0]?.businessName;
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="card p-10 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl"
            style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)" }}>
            ⛔
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--c-fg)" }}>Access restricted</h1>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--c-muted)" }}>
              Wallet{" "}
              <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                style={{ background: "var(--c-bg-hover)", color: "var(--c-fg)" }}>
                {short(address)}
              </span>{" "}
              is registered as an employee{biz ? ` at ${biz}` : ""}.
            </p>
          </div>
          <Link href="/employee" className="btn-primary inline-flex mx-auto rounded-xl">
            Go to your employee view
          </Link>
        </div>
      </div>
    );
  }

  const employer = address!.toLowerCase();

  return (
    <div className="space-y-6">
      <BusinessHeader employer={employer} />

      {/* Welcome banner */}
      {!who.tenantExists && (
        <div className="rounded-2xl border p-5"
          style={{ borderColor: "var(--c-border-s)", background: "rgba(146,0,225,0.06)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--c-primary)" }}>
            Welcome — fresh business tenant
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--c-muted)" }}>
            Register your team in the Team tab, log attendance, and the AI agent handles payroll automatically.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl p-1 w-fit"
        style={{ background: "var(--c-bg-card)", border: "1px solid var(--c-border)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
            style={
              tab === t.id
                ? {
                    background: "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)",
                    color: "#fff",
                    boxShadow: "0 0 14px rgba(146,0,225,0.35)",
                  }
                : { color: "var(--c-muted)" }
            }
            onMouseEnter={(e) => { if (tab !== t.id) (e.target as HTMLElement).style.color = "var(--c-fg)"; }}
            onMouseLeave={(e) => { if (tab !== t.id) (e.target as HTMLElement).style.color = "var(--c-muted)"; }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — rendered but hidden when inactive to preserve React state */}
      <div className={tab === "overview"   ? "" : "hidden"}><OverviewStats employer={employer} /></div>
      <div className={tab === "team"       ? "" : "hidden"}><EmployeesPanel    employer={employer} /></div>
      <div className={tab === "attendance" ? "" : "hidden"}><AttendanceLog     employer={employer} /></div>
      <div className={tab === "agent"      ? "" : "hidden"}><AgentPanel        employer={employer} /></div>
      <div className={tab === "payroll"    ? "" : "hidden"}><PayrollPanel      employer={employer} /></div>
      <div className={tab === "history"    ? "" : "hidden"}><TransactionHistory employer={employer} /></div>
    </div>
  );
}

function OverviewStats({ employer }: { employer: string }) {
  const [stats, setStats] = useState({ employees: 0, openClockIns: 0, reports: 0 });

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees?employer=${employer}`).then((r) => r.json()),
      fetch(`/api/attendance?employer=${employer}`).then((r) => r.json()),
      fetch(`/api/payroll/reports?employer=${employer}`).then((r) => r.json()),
    ]).then(([emps, att, reps]) => {
      setStats({
        employees:    Array.isArray(emps) ? emps.length : 0,
        openClockIns: Array.isArray(att)  ? att.filter((a: any) => !a.clockOut).length : 0,
        reports:      Array.isArray(reps) ? reps.length : 0,
      });
    });
  }, [employer]);

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <StatCard label="Team members"        value={stats.employees}    color="#9200e1" />
      <StatCard label="Currently clocked in" value={stats.openClockIns} color="#dd23bb" glow={stats.openClockIns > 0} />
      <StatCard label="Payroll runs"         value={stats.reports}      color="#7b00bf" />
    </div>
  );
}

function StatCard({ label, value, color, glow }: { label: string; value: number; color: string; glow?: boolean }) {
  return (
    <div
      className="card p-6 transition-all duration-200"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-bg-card)")}
      style={glow ? { boxShadow: `0 0 28px ${color}25, var(--c-card-shadow)` } : {}}
    >
      <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--c-muted)" }}>
        {label}
      </div>
      <div className="text-4xl font-black mt-3 tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}
