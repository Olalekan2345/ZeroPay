import fs from "node:fs/promises";
import path from "node:path";
import type { Employee, AttendanceEntry, PayrollReport } from "./types";

/**
 * Multi-tenant local store. Each employer wallet gets its own namespace under
 * `data/tenants/<employer>/…`. 0G Storage is still the source of truth for
 * records; these files index them per-tenant.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const TENANTS_DIR = path.join(DATA_DIR, "tenants");

export type PaymentSchedule = {
  frequency: "daily" | "weekly" | "monthly";
  hour: number;        // 0-23
  minute: number;      // 0-59
  dayOfWeek?: number;  // 0-6, weekly only (6 = Saturday default)
  dayOfMonth?: number; // 1-28, monthly only (1 = 1st of month default)
};

export type TenantSettings = {
  employer: string;
  businessName?: string;
  poolAddress?: `0x${string}`;
  paymentSchedule?: PaymentSchedule;
  createdAt: number;
};

function normEmp(addr: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) throw new Error("bad employer address");
  return addr.toLowerCase();
}

function tenantDir(employer: string) {
  return path.join(TENANTS_DIR, normEmp(employer));
}

async function ensure(employer: string) {
  await fs.mkdir(tenantDir(employer), { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

/* ---------- settings ---------- */

export async function getSettings(employer: string): Promise<TenantSettings> {
  await ensure(employer);
  const file = path.join(tenantDir(employer), "settings.json");
  const existing = await readJson<TenantSettings | null>(file, null);
  if (existing) return existing;
  const fresh: TenantSettings = {
    employer: normEmp(employer),
    createdAt: Date.now(),
  };
  await writeJson(file, fresh);
  return fresh;
}

export async function saveSettings(
  employer: string,
  patch: Partial<TenantSettings>,
) {
  const current = await getSettings(employer);
  const next = { ...current, ...patch, employer: normEmp(employer) };
  await writeJson(path.join(tenantDir(employer), "settings.json"), next);
  return next;
}

/* ---------- employees ---------- */

export async function listEmployees(employer: string): Promise<Employee[]> {
  await ensure(employer);
  return readJson<Employee[]>(
    path.join(tenantDir(employer), "employees.json"),
    [],
  );
}

export async function saveEmployees(employer: string, rows: Employee[]) {
  await ensure(employer);
  await writeJson(path.join(tenantDir(employer), "employees.json"), rows);
}

export async function upsertEmployee(employer: string, e: Employee) {
  const rows = await listEmployees(employer);
  const idx = rows.findIndex((r) => r.id === e.id);
  if (idx >= 0) rows[idx] = e;
  else rows.push(e);
  await saveEmployees(employer, rows);
}

export async function deleteEmployee(employer: string, id: string) {
  const rows = (await listEmployees(employer)).filter((r) => r.id !== id);
  await saveEmployees(employer, rows);
}

/* ---------- attendance ---------- */

export async function listAttendance(
  employer: string,
): Promise<AttendanceEntry[]> {
  await ensure(employer);
  return readJson<AttendanceEntry[]>(
    path.join(tenantDir(employer), "attendance.json"),
    [],
  );
}

export async function saveAttendance(
  employer: string,
  rows: AttendanceEntry[],
) {
  await ensure(employer);
  await writeJson(path.join(tenantDir(employer), "attendance.json"), rows);
}

export async function addAttendance(
  employer: string,
  entry: AttendanceEntry,
) {
  const rows = await listAttendance(employer);
  rows.push(entry);
  await saveAttendance(employer, rows);
}

export async function updateAttendance(
  employer: string,
  entry: AttendanceEntry,
) {
  const rows = await listAttendance(employer);
  const idx = rows.findIndex((r) => r.id === entry.id);
  if (idx >= 0) rows[idx] = entry;
  else rows.push(entry);
  await saveAttendance(employer, rows);
}

/* ---------- reports ---------- */

export async function listReports(employer: string): Promise<PayrollReport[]> {
  await ensure(employer);
  return readJson<PayrollReport[]>(
    path.join(tenantDir(employer), "reports.json"),
    [],
  );
}

export async function addReport(employer: string, r: PayrollReport) {
  const rows = await listReports(employer);
  rows.unshift(r);
  await writeJson(
    path.join(tenantDir(employer), "reports.json"),
    rows.slice(0, 200),
  );
}

/* ---------- cross-tenant lookups (employee view + guard) ---------- */

async function listTenantDirs(): Promise<string[]> {
  try {
    return await fs.readdir(TENANTS_DIR);
  } catch {
    return [];
  }
}

export type EmployeeHit = {
  employer: string;
  settings: TenantSettings;
  employee: Employee;
  attendance: AttendanceEntry[];
  reports: PayrollReport[];
};

/** Find which tenant(s) have this wallet registered as an employee. */
export async function findEmployeeByWallet(
  wallet: string,
): Promise<EmployeeHit[]> {
  const w = wallet.toLowerCase();
  const hits: EmployeeHit[] = [];
  for (const dir of await listTenantDirs()) {
    const employer = dir;
    const employees = await listEmployees(employer).catch(() => []);
    const match = employees.find((e) => e.wallet.toLowerCase() === w);
    if (!match) continue;
    const [attendance, reports, settings] = await Promise.all([
      listAttendance(employer),
      listReports(employer),
      getSettings(employer),
    ]);
    hits.push({
      employer,
      settings,
      employee: match,
      attendance: attendance.filter((a) => a.employeeId === match.id),
      reports,
    });
  }
  return hits;
}

/** Has this tenant been initialized (has settings + at least one action)? */
export async function tenantExists(employer: string): Promise<boolean> {
  try {
    await fs.stat(path.join(tenantDir(employer), "settings.json"));
    return true;
  } catch {
    return false;
  }
}
