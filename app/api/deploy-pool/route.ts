import { NextResponse } from "next/server";
import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";
import { requireEmployer } from "@/lib/tenant";
import { saveSettings, getSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const pk = process.env.EMPLOYER_PRIVATE_KEY;
  if (!pk)
    return NextResponse.json(
      { error: "EMPLOYER_PRIVATE_KEY not set — platform key required to deploy." },
      { status: 500 },
    );

  // Don't redeploy if contract already exists — use force=true to override
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  if (!force) {
    const existing = await getSettings(g.employer);
    if (existing.poolAddress)
      return NextResponse.json(
        { error: "Contract already deployed. Use force=true to redeploy.", address: existing.poolAddress },
        { status: 409 },
      );
  }

  try {
    const [binRaw, abiRaw] = await Promise.all([
      fs.readFile(path.join(process.cwd(), "contracts", "out", "PayrollPool.bin"), "utf8"),
      fs.readFile(path.join(process.cwd(), "contracts", "out", "PayrollPool.abi"), "utf8"),
    ]);
    const bytecode = "0x" + binRaw.trim();
    const abi      = JSON.parse(abiRaw);

    const rpc      = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer   = new ethers.Wallet(pk.startsWith("0x") ? pk : "0x" + pk, provider);

    const operatorAddress = signer.address;          // platform key = operator
    const ownerAddress    = ethers.getAddress(g.employer); // employer wallet = owner

    const factory  = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(ownerAddress, operatorAddress);
    await contract.waitForDeployment();
    const address  = await contract.getAddress() as `0x${string}`;

    await saveSettings(g.employer, { poolAddress: address });

    return NextResponse.json({ address, owner: ownerAddress, operator: operatorAddress });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
