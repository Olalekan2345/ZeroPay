import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { listEmployees, listAttendance, getOperatorKey, saveOperatorKey } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const { searchParams } = new URL(req.url);
  const weekOffset  = Number(searchParams.get("weekOffset") ?? 0);
  const rawPeriod   = searchParams.get("period");
  const period      = (rawPeriod === "daily" ? "daily" : rawPeriod === "monthly" ? "monthly" : "weekly") as "daily" | "weekly" | "monthly";
  const rawIds      = searchParams.get("employeeIds");
  const employeeIds = rawIds ? rawIds.split(",").filter(Boolean) : null;

  // Read agent wallet balance
  let agentBalanceWei = 0n;
  let rawPk = await getOperatorKey(g.employer);
  if (!rawPk) {
    const fresh = ethers.Wallet.createRandom();
    rawPk = fresh.privateKey;
    await saveOperatorKey(g.employer, rawPk);
  }

  try {
    const rpc      = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
    const provider = new ethers.JsonRpcProvider(rpc);
    const address  = new ethers.Wallet(rawPk.startsWith("0x") ? rawPk : "0x" + rawPk).address;
    agentBalanceWei = await provider.getBalance(address);
  } catch { /* show 0 balance if RPC fails */ }

  const [allEmployees, attendance] = await Promise.all([
    listEmployees(g.employer),
    listAttendance(g.employer),
  ]);

  const employees = employeeIds
    ? allEmployees.filter((e) => employeeIds.includes(e.id))
    : allEmployees;

  const report = buildReport({
    employees,
    attendance,
    poolBalanceWei: agentBalanceWei,
    weekOffset: weekOffset === -1 ? -1 : 0,
    period,
  });

  return NextResponse.json(report);
}
