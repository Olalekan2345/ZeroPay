import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, formatEther } from "viem";
import { zgGalileo } from "@/lib/chain";
import { parseEmployer, resolvePoolAddress } from "@/lib/tenant";

export const runtime = "nodejs";

const EVENTS = [
  parseAbiItem("event Funded(address indexed from, uint256 amount, uint256 newBalance)"),
  parseAbiItem("event Withdrawn(address indexed to, uint256 amount, uint256 newBalance)"),
  parseAbiItem("event SalaryPaid(address indexed employee, uint256 amount, uint256 hoursWorked, uint256 periodStart, string storageRef)"),
  parseAbiItem("event BatchSettled(uint256 totalPaid, uint256 employeeCount, uint256 periodStart, string storageRef)"),
];

export async function GET(req: Request) {
  const employer = parseEmployer(req.url);
  if (!employer)
    return NextResponse.json({ error: "employer required" }, { status: 400 });

  const address = await resolvePoolAddress(employer);
  if (!address)
    return NextResponse.json({ error: "Pool address not configured." }, { status: 400 });

  const client = createPublicClient({ chain: zgGalileo, transport: http() });

  let latestBlock: bigint;
  try {
    latestBlock = await client.getBlockNumber();
  } catch (err) {
    return NextResponse.json({ error: `RPC error: ${(err as Error).message}` }, { status: 502 });
  }

  // Look back up to 50 000 blocks (~7 days on 0G Galileo)
  const fromBlock = latestBlock > 50_000n ? latestBlock - 50_000n : 0n;

  try {
    const logs = await client.getLogs({
      address,
      events: EVENTS,
      fromBlock,
      toBlock: latestBlock,
    });

    // Fetch block timestamps for the unique blocks we saw
    const blockNums = [...new Set(logs.map((l) => l.blockNumber))];
    const blocks = await Promise.all(
      blockNums.map((n) => client.getBlock({ blockNumber: n! })),
    );
    const tsMap = new Map(blocks.map((b) => [b.number.toString(), Number(b.timestamp)]));

    const txs = logs
      .map((log, i) => {
        const ts = tsMap.get(log.blockNumber!.toString()) ?? 0;
        const base = {
          txHash:      log.transactionHash,
          blockNumber: Number(log.blockNumber),
          timestamp:   ts * 1000, // ms
          event:       log.eventName,
          // Stable unique key even when multiple events share the same txHash
          key:         `${log.transactionHash}-${log.eventName}-${i}`,
        };

        if (log.eventName === "Funded") {
          const { from, amount } = log.args as { from: string; amount: bigint; newBalance: bigint };
          return { ...base, from, amount: formatEther(amount), label: "Deposit" };
        }
        if (log.eventName === "Withdrawn") {
          const { to, amount } = log.args as { to: string; amount: bigint; newBalance: bigint };
          return { ...base, to, amount: formatEther(amount), label: "Withdrawal" };
        }
        if (log.eventName === "SalaryPaid") {
          const { employee, amount, hoursWorked } = log.args as {
            employee: string; amount: bigint; hoursWorked: bigint;
            periodStart: bigint; storageRef: string;
          };
          return {
            ...base,
            employee,
            amount:      formatEther(amount),
            hoursWorked: Number(hoursWorked) / 100,
            label: "Salary",
          };
        }
        if (log.eventName === "BatchSettled") {
          const { totalPaid, employeeCount } = log.args as {
            totalPaid: bigint; employeeCount: bigint;
            periodStart: bigint; storageRef: string;
          };
          return {
            ...base,
            totalPaid:     formatEther(totalPaid),
            employeeCount: Number(employeeCount),
            label: "Batch payroll",
          };
        }
        return base;
      })
      .reverse(); // newest first

    return NextResponse.json({ address, txs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
