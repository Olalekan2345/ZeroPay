import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { listEmployees, listAttendance, addReport, getOperatorKey, saveOperatorKey } from "@/lib/db";
import { buildReport } from "@/lib/agent";
import { putJSON } from "@/lib/storage";
import { requireEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

const GAS_PER_TX = 21_000n;
const GAS_PRICE  = 2_000_000_000n; // 2 Gwei

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body       = await req.json().catch(() => ({}));
  const weekOffset = body.weekOffset === -1 ? -1 : 0;
  const period: "daily" | "weekly" | "monthly" =
    body.period === "daily" ? "daily" : body.period === "monthly" ? "monthly" : "weekly";
  const employeeIds: string[] | null =
    Array.isArray(body.employeeIds) && body.employeeIds.length > 0 ? body.employeeIds : null;

  // Get or auto-create agent wallet key
  let rawPk = await getOperatorKey(g.employer);
  if (!rawPk) {
    const fresh = ethers.Wallet.createRandom();
    rawPk = fresh.privateKey;
    await saveOperatorKey(g.employer, rawPk);
  }

  const rpc         = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const provider    = new ethers.JsonRpcProvider(rpc);
  const agentWallet = new ethers.Wallet(
    rawPk.startsWith("0x") ? rawPk : "0x" + rawPk,
    provider,
  );

  let agentBalanceWei: bigint;
  try {
    agentBalanceWei = await provider.getBalance(agentWallet.address);
  } catch (err) {
    return NextResponse.json(
      { error: `Cannot read agent wallet balance: ${(err as Error).message}` },
      { status: 502 },
    );
  }

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
    weekOffset,
    period,
  });

  const payable = report.lines.filter((l) => BigInt(l.amountWei) > 0n);

  if (payable.length === 0) {
    report.warnings.push("No payable hours for this period.");
    report.storageRef = await putJSON({ kind: "payroll", employer: g.employer, ...report });
    await addReport(g.employer, report);
    return NextResponse.json(report);
  }

  const totalOwed = payable.reduce((s, l) => s + BigInt(l.amountWei), 0n);
  const gasCost   = GAS_PER_TX * GAS_PRICE * BigInt(payable.length);

  if (totalOwed + gasCost > agentBalanceWei) {
    report.sufficient = false;
    report.warnings.push(
      `Agent wallet balance (${ethers.formatEther(agentBalanceWei)} 0G) is insufficient ` +
      `to cover payroll (${ethers.formatEther(totalOwed)} 0G) + gas (~${ethers.formatEther(gasCost)} 0G). ` +
      `Send at least ${ethers.formatEther(totalOwed + gasCost - agentBalanceWei)} more 0G to the agent wallet.`,
    );
    report.storageRef = await putJSON({ kind: "payroll", employer: g.employer, ...report });
    await addReport(g.employer, report);
    return NextResponse.json({ ...report, error: "insufficient_pool" }, { status: 402 });
  }

  report.storageRef = await putJSON({ kind: "payroll", employer: g.employer, ...report });

  try {
    let nonce = await provider.getTransactionCount(agentWallet.address);
    const hashes: string[] = [];

    for (const line of payable) {
      const tx = await agentWallet.sendTransaction({
        to:                  line.wallet,
        value:               BigInt(line.amountWei),
        nonce:               nonce++,
        gasLimit:            GAS_PER_TX,
        maxPriorityFeePerGas: GAS_PRICE,
      });
      hashes.push(tx.hash);
    }

    // Wait for the last tx to confirm — earlier ones are already mined by then
    if (hashes.length > 0) {
      const receipt = await provider.waitForTransaction(hashes[hashes.length - 1], 1, 90_000);
      if (receipt && receipt.status === 0)
        throw new Error("One or more payment transactions reverted on-chain.");
    }

    report.txHash = hashes[0] as `0x${string}`;
    await addReport(g.employer, report);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { ...report, error: `Transaction failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
