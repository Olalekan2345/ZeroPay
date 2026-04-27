#!/usr/bin/env node
/**
 * ZeroPay weekly agent — intended to run as a cron every Saturday morning.
 *   cron: 0 9 * * 6  node scripts/run-agent.mjs --employer 0x...
 *
 * Each employer tenant runs its own schedule. The server verifies the
 * configured EMPLOYER_PRIVATE_KEY matches --employer before signing.
 */
const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const base = process.env.ZEROPAY_BASE_URL ?? "http://localhost:3000";
const employer = get("--employer") ?? process.env.ZEROPAY_EMPLOYER;
const weekOffset = args.includes("--last-week") ? -1 : 0;

if (!employer) {
  console.error("Missing --employer 0x... (or ZEROPAY_EMPLOYER env)");
  process.exit(1);
}

const res = await fetch(
  `${base}/api/payroll/run?employer=${employer.toLowerCase()}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ weekOffset }),
  },
);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
if (!res.ok) process.exit(1);
