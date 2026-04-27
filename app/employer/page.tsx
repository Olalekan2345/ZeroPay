"use client";

import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import Link from "next/link";
import PoolCard from "@/components/PoolCard";
import EmployeesPanel from "@/components/EmployeesPanel";
import AttendanceLog from "@/components/AttendanceLog";
import PayrollPanel from "@/components/PayrollPanel";
import AgentPanel from "@/components/AgentPanel";
import BusinessHeader from "@/components/BusinessHeader";
import TransactionHistory from "@/components/TransactionHistory";
import { short } from "@/lib/format";

type Who =
  | { role: "employer"; tenantExists: boolean }
  | {
      role: "employee";
      employers: {
        employer: string;
        businessName: string | null;
        employeeName: string;
      }[];
    };

type Tab = "overview" | "team" | "attendance" | "agent" | "payroll" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",   label: "Overview"    },
  { id: "team",       label: "Team"        },
  { id: "attendance", label: "Attendance"  },
  { id: "agent",      label: "AI Agent"    },
  { id: "payroll",    label: "Reports"     },
  { id: "history",    label: "History"     },
];

export default function EmployerPage() {
  const { address, isConnected } = useAccount();
  const [who, setWho]     = useState<Who | null>(null);
  const [err, setErr]     = useState<string | null>(null);
  const [tab, setTab]     = useState<Tab>("overview");

  useEffect(() => {
    if (!address) return;
    setWho(null);
    setErr(null);
    fetch(`/api/whoami?wallet=${address.toLowerCase()}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "failed");
        setWho(j);
      })
      .catch((e) => setErr((e as Error).message));
  }, [address]);

  /* ── Not connected ── */
  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <div className="card p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-700 mx-auto flex items-center justify-center">
            <span className="text-white text-2xl">Z</span>
          </div>
          <h1 className="text-xl font-semibold">Employer dashboard</h1>
          <p className="text-ink-500 text-sm leading-relaxed">
            Connect a wallet to open your payroll dashboard.
            Any new wallet automatically gets a fresh business tenant.
          </p>
        </div>
      </div>
    );
  }

  if (err) {
    return <div className="card p-10 text-center text-red-600">{err}</div>;
  }

  if (!who) {
    return (
      <div className="card p-10 text-center text-ink-500">
        Checking access…
      </div>
    );
  }

  /* ── Employee trying to access employer page ── */
  if (who.role === "employee") {
    const biz = who.employers[0]?.businessName;
    return (
      <div className="max-w-lg mx-auto mt-16">
        <div className="card p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-100 mx-auto flex items-center justify-center">
            <span className="text-red-600 text-2xl">⛔</span>
          </div>
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="text-ink-500 text-sm leading-relaxed">
            Wallet{" "}
            <span className="font-mono bg-slate-100 px-1 rounded">
              {short(address)}
            </span>{" "}
            is registered as an employee
            {biz ? ` at ${biz}` : ""}. Employees cannot open the employer
            dashboard.
          </p>
          <p className="text-ink-500 text-xs">
            To become an employer, you must first be removed from your current
            employer&apos;s team.
          </p>
          <Link href="/employee" className="btn-primary inline-flex">
            Go to your employee view
          </Link>
        </div>
      </div>
    );
  }

  const employer = address!.toLowerCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <BusinessHeader employer={employer} />

      {/* Welcome banner for new tenants */}
      {!who.tenantExists && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
          <p className="text-sm font-semibold text-brand-700">
            Welcome — fresh business tenant
          </p>
          <p className="text-xs text-ink-600 mt-1">
            Register your team in the Team tab, log attendance, and the AI agent handles payroll automatically.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white shadow-soft text-ink-900"
                : "text-ink-500 hover:text-ink-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-6">
          <PoolCard employer={employer} />
          <OverviewStats employer={employer} />
        </div>
      )}

      {tab === "team" && (
        <EmployeesPanel employer={employer} />
      )}

      {tab === "attendance" && (
        <AttendanceLog employer={employer} />
      )}

      {tab === "agent" && (
        <AgentPanel employer={employer} />
      )}

      {tab === "payroll" && (
        <PayrollPanel employer={employer} />
      )}

      {tab === "history" && (
        <TransactionHistory employer={employer} />
      )}
    </div>
  );
}

/* Quick-stat cards shown on the Overview tab */
function OverviewStats({ employer }: { employer: string }) {
  const [stats, setStats] = useState({
    employees: 0,
    openClockIns: 0,
    reports: 0,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees?employer=${employer}`).then((r) => r.json()),
      fetch(`/api/attendance?employer=${employer}`).then((r) => r.json()),
      fetch(`/api/payroll/reports?employer=${employer}`).then((r) => r.json()),
    ]).then(([emps, att, reps]) => {
      const employees   = Array.isArray(emps) ? emps.length : 0;
      const openClockIns = Array.isArray(att)
        ? att.filter((a: any) => !a.clockOut).length
        : 0;
      const reports = Array.isArray(reps) ? reps.length : 0;
      setStats({ employees, openClockIns, reports });
    });
  }, [employer]);

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <StatCard label="Registered employees" value={stats.employees} />
      <StatCard label="Currently clocked in" value={stats.openClockIns} accent />
      <StatCard label="Payroll runs" value={stats.reports} />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  const accentCls = accent && value > 0
    ? "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-900/20"
    : "dark:bg-gray-900 dark:border-gray-800";
  return (
    <div className={`card p-6 ${accentCls}`}>
      <div className="text-xs uppercase tracking-wide text-ink-500 dark:text-gray-400">{label}</div>
      <div className="text-3xl font-semibold mt-2 dark:text-white">{value}</div>
    </div>
  );
}
