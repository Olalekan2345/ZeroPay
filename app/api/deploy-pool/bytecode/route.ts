import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const bin = await fs.readFile(
      path.join(process.cwd(), "contracts", "out", "PayrollPool.bin"),
      "utf8",
    );
    const bytecode = ("0x" + bin.trim()) as `0x${string}`;
    return NextResponse.json({ bytecode });
  } catch {
    return NextResponse.json(
      { error: "Bytecode not found. Run: npm run compile" },
      { status: 404 },
    );
  }
}
