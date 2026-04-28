import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ error: "Agent wallet removed — payments go directly from employer wallet." }, { status: 410 });
}
