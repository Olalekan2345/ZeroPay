import { NextResponse } from "next/server";
import { parseEmployer } from "@/lib/tenant";
import { listReports } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const employer = parseEmployer(req.url);
  if (!employer)
    return NextResponse.json({ error: "employer required" }, { status: 400 });

  const reports = await listReports(employer);

  const txs = reports
    .filter((r) => r.txHash && r.lines.some((l) => BigInt(l.amountWei) > 0n))
    .map((r) => ({
      txHash:        r.txHash,
      timestamp:     r.generatedAt,
      label:         "Payroll",
      totalPaid:     (Number(BigInt(r.totalPaidWei)) / 1e18).toFixed(4),
      employeeCount: r.lines.filter((l) => BigInt(l.amountWei) > 0n).length,
      storageRef:    r.storageRef,
      key:           r.txHash ?? String(r.generatedAt),
    }));

  return NextResponse.json({ txs });
}
