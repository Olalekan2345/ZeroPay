import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "Vault bytecode no longer served — contracts removed." },
    { status: 410 },
  );
}
