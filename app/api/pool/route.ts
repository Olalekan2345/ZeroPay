import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { parseEmployer } from "@/lib/tenant";
import { getOperatorKey } from "@/lib/db";

export const runtime = "nodejs";

// Redirects old pool callers to the agent wallet info.
export async function GET(req: Request) {
  const employer = parseEmployer(req.url);
  if (!employer)
    return NextResponse.json({ error: "employer required" }, { status: 400 });

  const key = await getOperatorKey(employer);
  if (!key)
    return NextResponse.json({ configured: false, balanceWei: "0", address: null });

  const rpc      = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const provider = new ethers.JsonRpcProvider(rpc);
  const address  = new ethers.Wallet(key).address;

  let balanceWei = "0";
  try { balanceWei = (await provider.getBalance(address)).toString(); } catch { /* ignore */ }

  return NextResponse.json({ configured: true, hasCode: false, address, balanceWei });
}
