import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { parseEmployer } from "@/lib/tenant";
import { getOperatorKey, saveOperatorKey } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const employer = parseEmployer(req.url);
  if (!employer)
    return NextResponse.json({ error: "employer required" }, { status: 400 });

  const rpc = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const provider = new ethers.JsonRpcProvider(rpc);

  let key = await getOperatorKey(employer);
  if (!key) {
    const wallet = ethers.Wallet.createRandom();
    key = wallet.privateKey;
    await saveOperatorKey(employer, key);
  }

  const agentWallet = new ethers.Wallet(key);
  const address = agentWallet.address;

  let balanceWei = "0";
  try {
    balanceWei = (await provider.getBalance(address)).toString();
  } catch { /* ignore RPC errors */ }

  return NextResponse.json({ address, balanceWei });
}
