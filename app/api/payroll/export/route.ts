import { listEmployees, listAttendance } from "@/lib/db";
import { buildReport, reportToCSV } from "@/lib/agent";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return new Response(g.error, { status: g.status });

  const { searchParams } = new URL(req.url);
  const weekOffset = Number(searchParams.get("weekOffset") ?? 0);

  const [employees, attendance] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
  ]);

  const report = buildReport({
    employees,
    attendance,
    poolBalanceWei: 0n,
    weekOffset: weekOffset === -1 ? -1 : 0,
  });

  const csv = reportToCSV(report);
  const wk  = new Date(report.weekStart).toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "content-type":        "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="zeropay-week-${wk}.csv"`,
    },
  });
}
