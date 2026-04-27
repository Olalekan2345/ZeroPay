import { NextResponse } from "next/server";
import {
  listAttendance,
  addAttendance,
  updateAttendance,
  listEmployees,
} from "@/lib/db";
import { putJSON } from "@/lib/storage";
import { requireEmployer } from "@/lib/tenant";
import type { AttendanceEntry } from "@/lib/types";
import crypto from "node:crypto";

export const runtime = "nodejs";

const WORK_START = 9;  // 09:00
const WORK_END   = 17; // 17:00

function clockInAllowed(now: Date): { ok: true } | { ok: false; reason: string } {
  const dow  = now.getDay();       // 0 = Sun, 6 = Sat
  const hour = now.getHours();

  if (dow === 0 || dow === 6)
    return { ok: false, reason: "Clock-in is not allowed on weekends (Mon–Fri only)." };

  if (hour >= WORK_END)
    return {
      ok: false,
      reason: `Clock-in is not allowed after ${WORK_END}:00. Work hours are ${WORK_START}:00–${WORK_END}:00.`,
    };

  return { ok: true };
}

export async function GET(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  const rows = await listAttendance(g.employer);
  return NextResponse.json(
    employeeId ? rows.filter((r) => r.employeeId === employeeId) : rows,
  );
}

export async function POST(req: Request) {
  const g = await requireEmployer(req.url);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json();
  const action     = String(body.action ?? "");
  const employeeId = String(body.employeeId ?? "");
  if (!employeeId)
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  const employees = await listEmployees(g.employer);
  if (!employees.find((e) => e.id === employeeId))
    return NextResponse.json({ error: "unknown employee" }, { status: 404 });

  const rows = await listAttendance(g.employer);
  const open = rows.find((r) => r.employeeId === employeeId && !r.clockOut);

  if (action === "in") {
    const check = clockInAllowed(new Date());
    if (!check.ok)
      return NextResponse.json({ error: check.reason }, { status: 422 });

    if (open)
      return NextResponse.json(
        { error: "Employee is already clocked in.", entry: open },
        { status: 409 },
      );

    const entry: AttendanceEntry = {
      id: crypto.randomUUID(),
      employeeId,
      clockIn: Date.now(),
      clockOut: null,
    };
    entry.storageRef = await putJSON({
      kind: "attendance",
      employer: g.employer,
      ...entry,
    });
    await addAttendance(g.employer, entry);
    return NextResponse.json(entry, { status: 201 });
  }

  if (action === "out") {
    if (!open)
      return NextResponse.json({ error: "No open clock-in for this employee." }, { status: 409 });
    open.clockOut = Date.now();
    open.storageRef = await putJSON({
      kind: "attendance",
      employer: g.employer,
      ...open,
    });
    await updateAttendance(g.employer, open);
    return NextResponse.json(open);
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
