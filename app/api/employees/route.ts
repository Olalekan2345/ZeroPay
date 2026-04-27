import { NextResponse } from "next/server";
import { listEmployees, upsertEmployee, deleteEmployee } from "@/lib/db";
import { putJSON } from "@/lib/storage";
import { requireEmployer } from "@/lib/tenant";
import type { Employee } from "@/lib/types";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json(await listEmployees(g.employer));
}

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const wallet = String(body.wallet ?? "").trim() as `0x${string}`;
  const hourlyRate = Number(body.hourlyRate);

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet))
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  if (wallet.toLowerCase() === g.employer)
    return NextResponse.json(
      { error: "employer cannot add themselves as an employee" },
      { status: 400 },
    );
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0)
    return NextResponse.json({ error: "invalid hourlyRate" }, { status: 400 });

  const id = body.id ?? crypto.randomUUID();
  const record: Employee = {
    id,
    name,
    wallet,
    hourlyRate,
    createdAt: Date.now(),
  };
  record.storageRef = await putJSON({
    kind: "employee",
    employer: g.employer,
    ...record,
  });
  await upsertEmployee(g.employer, record);
  return NextResponse.json(record, { status: 201 });
}

export async function PATCH(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json();
  const id   = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const rows = await listEmployees(g.employer);
  const existing = rows.find((r) => r.id === id);
  if (!existing) return NextResponse.json({ error: "employee not found" }, { status: 404 });

  const updated: Employee = { ...existing };

  if (typeof body.name === "string" && body.name.trim())
    updated.name = body.name.trim();

  if (typeof body.hourlyRate === "number") {
    if (!Number.isFinite(body.hourlyRate) || body.hourlyRate <= 0)
      return NextResponse.json({ error: "invalid hourlyRate" }, { status: 400 });
    updated.hourlyRate = body.hourlyRate;
  }

  /* Wallet is identity — not editable via this endpoint */

  updated.storageRef = await putJSON({
    kind: "employee_update",
    employer: g.employer,
    ...updated,
    updatedAt: Date.now(),
  });

  await upsertEmployee(g.employer, updated);
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteEmployee(g.employer, id);
  return NextResponse.json({ ok: true });
}
