import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { requireEmployer } from "@/lib/tenant";
import { saveSettings, getSettings, saveOperatorKey } from "@/lib/db";
import { PAYROLL_POOL_BYTECODE } from "@/lib/abi/PayrollPoolBytecode";
import { PAYROLL_POOL_ABI } from "@/lib/abi/PayrollPool";

export const runtime = "nodejs";

const SEED_AMOUNT = ethers.parseEther("0.02"); // gas reserve for new operator key

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const platformPk = process.env.EMPLOYER_PRIVATE_KEY;
  if (!platformPk)
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
    const bytecode = PAYROLL_POOL_BYTECODE;
    const abi      = PAYROLL_POOL_ABI;

    const rpc      = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
    const provider = new ethers.JsonRpcProvider(rpc);
    const platform = new ethers.Wallet(
      platformPk.startsWith("0x") ? platformPk : "0x" + platformPk,
      provider,
    );

    // Generate a fresh operator keypair for this employer
    const operatorWallet  = ethers.Wallet.createRandom().connect(provider);
    const operatorAddress = operatorWallet.address;
    const operatorKey     = operatorWallet.privateKey;

    // Seed the operator address with gas (0.02 0G) from the platform key
    const seedTx = await platform.sendTransaction({
      to:       operatorAddress,
      value:    SEED_AMOUNT,
      gasLimit: 21_000n,
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    });
    await seedTx.wait();

    const ownerAddress = ethers.getAddress(g.employer); // employer wallet = owner

    // Deploy with explicit gasLimit to skip estimateGas (0G Galileo RPC can misreport)
    const factory  = new ethers.ContractFactory(abi, bytecode, platform);
    const contract = await factory.deploy(ownerAddress, operatorAddress, {
      gasLimit: 2_000_000n,
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    });
    await contract.waitForDeployment();
    const address  = await contract.getAddress() as `0x${string}`;

    // Save pool address in settings; save operator key to a separate gitignored file
    await saveSettings(g.employer, { poolAddress: address });
    await saveOperatorKey(g.employer, operatorKey);

    return NextResponse.json({ address, owner: ownerAddress, operator: operatorAddress });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
