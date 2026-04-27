import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="pt-8 pb-4">
        <div className="max-w-3xl">
          <span className="pill bg-brand-50 text-brand-700">
            Running on 0G Galileo testnet
          </span>
          <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight">
            AI payroll, paid from a pool you control.
          </h1>
          <p className="mt-4 text-ink-500 text-lg leading-relaxed">
            ZeroPay is a smart payroll agent. It tracks your team&apos;s hours,
            stores every attendance record on 0G Storage, and automatically
            pays salaries from an employer-funded pool every week.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/employer" className="btn-primary">
              Open employer dashboard
            </Link>
            <Link href="/employee" className="btn-ghost">
              Employee view
            </Link>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {[
          {
            title: "Employer-funded pool",
            body: "Deposit 0G tokens into a PayrollPool contract. All salaries are paid from it. Payments are blocked if the balance is insufficient.",
          },
          {
            title: "Agent enforces the rules",
            body: "Mon–Fri, 9:00–17:00, max 8 paid hours/day. Weekends are ignored. The agent is deterministic and auditable.",
          },
          {
            title: "Records on 0G Storage",
            body: "Every employee record, attendance entry and payroll report is persisted to 0G Storage with a verifiable content reference.",
          },
        ].map((c) => (
          <div key={c.title} className="card p-5">
            <div className="text-sm font-semibold">{c.title}</div>
            <div className="mt-2 text-sm text-ink-500 leading-relaxed">
              {c.body}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
