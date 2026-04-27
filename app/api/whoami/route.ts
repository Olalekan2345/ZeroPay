import { NextResponse } from "next/server";
import { findEmployeeByWallet, tenantExists } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Role resolver.
 *   - employee:  wallet is registered under some employer → cannot access /employer
 *   - employer:  wallet is not an employee anywhere → can run their own tenant
 * A wallet can be both, but employee status takes precedence for /employer access.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = (searchParams.get("wallet") ?? "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet))
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });

  const hits = await findEmployeeByWallet(wallet);
  if (hits.length > 0) {
    return NextResponse.json({
      role: "employee",
      employers: hits.map((h) => ({
        employer: h.employer,
        businessName: h.settings.businessName ?? null,
        employeeName: h.employee.name,
      })),
    });
  }
  return NextResponse.json({
    role: "employer",
    tenantExists: await tenantExists(wallet),
  });
}
