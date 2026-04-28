"use client";

import Link from "next/link";

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "#9200e1",
    title: "Employer-funded pool",
    body: "Deposit 0G tokens into a dedicated SecuredVault contract. All salaries deduct from it — never from your personal wallet.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: "#dd23bb",
    title: "AI enforces the rules",
    body: "Mon–Fri, 09:00–17:00, max 8 paid hours/day. The agent is deterministic, transparent, and fully on-chain auditable.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    ),
    color: "#7b00bf",
    title: "Records on 0G Storage",
    body: "Every attendance entry and payroll report is persisted to 0G decentralised storage with a verifiable content hash.",
  },
];

const STEPS = [
  { n: "01", title: "Connect wallet", body: "Any EVM wallet becomes a fresh employer tenant instantly — no sign-up." },
  { n: "02", title: "Deploy contract", body: "One click deploys your isolated SecuredVault with a unique operator key on 0G Galileo." },
  { n: "03", title: "Fund & run payroll", body: "Deposit 0G, add your team, set a schedule — the AI agent handles the rest." },
];

export default function Home() {
  return (
    <div className="space-y-20">
      {/* ── Hero ── */}
      <section className="pt-14 pb-2">
        <div className="max-w-2xl">
          <span className="pill-purple mb-6 inline-flex">
            Running on 0G Galileo testnet
          </span>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.06]"
            style={{ color: "var(--c-fg)" }}>
            AI payroll,{" "}
            <br />
            <span className="text-gradient-zg">powered by 0G.</span>
          </h1>

          <p className="mt-5 text-lg leading-relaxed max-w-xl" style={{ color: "var(--c-muted)" }}>
            ZeroPay tracks your team&apos;s hours, stores every record on 0G
            decentralised storage, and automatically executes salary payments
            from your on-chain pool — zero middlemen.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/employer"
              className="btn-primary px-7 py-3 rounded-2xl text-base font-bold"
            >
              Open employer dashboard
            </Link>
            <Link
              href="/employee"
              className="btn-ghost px-7 py-3 rounded-2xl text-base"
            >
              Employee view
            </Link>
          </div>
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section>
        <p className="text-xs uppercase tracking-widest font-semibold mb-5"
          style={{ color: "var(--c-dim)" }}>
          Core features
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card p-6 group cursor-default transition-all duration-200"
              style={{ "--hover-bg": "var(--c-bg-hover)" } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-bg-card)")}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${f.color}14`, border: `1px solid ${f.color}30`, color: f.color }}
              >
                {f.icon}
              </div>
              <div className="font-bold text-base" style={{ color: "var(--c-fg)" }}>{f.title}</div>
              <div className="mt-2 text-sm leading-relaxed" style={{ color: "var(--c-muted)" }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section>
        <p className="text-xs uppercase tracking-widest font-semibold mb-5"
          style={{ color: "var(--c-dim)" }}>
          How it works
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-4">
              <div className="text-3xl font-black tabular-nums flex-shrink-0 leading-none pt-0.5 text-gradient-zg">
                {s.n}
              </div>
              <div>
                <div className="font-bold" style={{ color: "var(--c-fg)" }}>{s.title}</div>
                <div className="mt-1 text-sm leading-relaxed" style={{ color: "var(--c-muted)" }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
