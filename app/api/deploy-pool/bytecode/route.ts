import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "ethers";
import { getOperatorKey } from "@/lib/db";
import { parseEmployer } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const bin = await fs.readFile(
      path.join(process.cwd(), "contracts", "out", "PayrollPool.bin"),
      "utf8",
    );
    const bytecode = ("0x" + bin.trim()) as `0x${string}`;

    // Derive operator address from stored key so the frontend can pass it as a constructor arg
    const employer = parseEmployer(req.url);
    let operatorAddress: string | null = null;
    if (employer) {
      const key = await getOperatorKey(employer);
      if (key) {
        try { operatorAddress = new ethers.Wallet(key).address; } catch { /* ignore */ }
      }
    }

    return NextResponse.json({ bytecode, operatorAddress });
  } catch {
    return NextResponse.json(
      { error: "Bytecode not found. Run: npm run compile" },
      { status: 404 },
    );
  }
}
