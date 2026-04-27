# ZeroPay — AI payroll on 0G Galileo

ZeroPay is a full-stack decentralized application that acts as a smart payroll
agent. It tracks employee working hours, persists every record to **0G
Storage**, and automatically pays salaries from an **employer-funded pool
contract** deployed on the **0G Galileo testnet**.

## Multi-tenant by design

ZeroPay is wallet-scoped. When you connect a wallet to `/employer`:

- If the wallet is **not registered as an employee anywhere**, it opens (or
  creates) its own business tenant — fresh pool settings, fresh employee
  list, fresh reports. Multiple businesses run side-by-side, each isolated
  by wallet.
- If the wallet **is** registered as an employee under any employer, the
  employer dashboard is blocked and the user is redirected to `/employee`.

Employees only ever see their own hours and pay history (`/employee`).

## Features

- **Payroll Pool** (`contracts/PayrollPool.sol`) — employer-owned contract that
  holds 0G tokens and pays salaries in a single `payBatch` call. Payments are
  blocked if the pool is underfunded.
- **Employee registry** — name, wallet, hourly rate. Each record is written to
  0G Storage and the returned content reference is saved alongside.
- **Attendance** — employer-controlled clock-in / clock-out. Every entry is a
  0G Storage record.
- **Rule-based AI agent** (`lib/agent.ts`) — aggregates weekly hours and
  enforces:
  - Workdays: Monday → Friday
  - Work hours: 09:00 → 17:00
  - Max 8 paid hours/day
  - Weekends ignored
  - Unfinished clock-outs flagged, not paid
- **Automatic weekly payment** — `scripts/run-agent.mjs` is meant to run as a
  Saturday cron. It calls `/api/payroll/run`, which builds the report, saves
  it to 0G Storage, and submits `payBatch` on-chain.
- **Payroll reports** — weekly summary, per-employee breakdown, CSV export.
- **Employee dashboard** — connect wallet, see hours, estimated earnings, and
  payment history. No edit access.

## Stack

- Next.js 14 (App Router) + Tailwind CSS
- wagmi v2 + viem for wallet + on-chain calls
- `@0glabs/0g-ts-sdk` for 0G Storage uploads (with local fallback)
- Solidity 0.8.20

## Quick start

```bash
cp .env.example .env
# Fill:
#   EMPLOYER_PRIVATE_KEY=<galileo testnet key funded with 0G>
#   NEXT_PUBLIC_PAYROLL_POOL_ADDRESS=<after deploy>

npm install

# Compile + deploy the pool (requires solc)
npm run compile
node scripts/deploy-pool.mjs
# copy the printed address into .env as NEXT_PUBLIC_PAYROLL_POOL_ADDRESS

npm run dev
# visit http://localhost:3000
```

## Running the weekly agent

Each employer tenant runs on its own schedule and key:

```bash
# Run payroll for the current week for a specific employer wallet
node scripts/run-agent.mjs --employer 0xYourEmployerWallet

# Run for the previous week (typical Saturday cron)
node scripts/run-agent.mjs --employer 0x... --last-week
```

Cron example (one line per tenant):

```
0 9 * * 6  cd /app && node scripts/run-agent.mjs --employer 0xAcme --last-week
```

The server verifies `EMPLOYER_PRIVATE_KEY` matches the `--employer` address
before signing — a server key can only drive its own tenant.

## 0G Integration

- **Storage** — `lib/storage.ts` uploads each record via `@0glabs/0g-ts-sdk`
  and stores the Merkle root. If credentials are missing it falls back to a
  content-hashed local file so the app stays usable during development.
- **Chain** — `lib/chain.ts` defines 0G Galileo (chain id `16601`, RPC
  `https://evmrpc-testnet.0g.ai`, explorer `chainscan-galileo.0g.ai`).
- **Contract** — `PayrollPool.sol` emits `SalaryPaid` and `BatchSettled`
  events carrying the 0G Storage reference for the backing payroll report,
  so every payout is verifiable against the stored attendance data.

## Folder layout

```
app/                Next.js app router pages + API routes
  api/              Employee, attendance, pool, payroll endpoints
  employer/         Employer dashboard
  employee/         Restricted employee view
components/         UI components (PoolCard, EmployeesPanel, ...)
contracts/          PayrollPool.sol
lib/                agent, storage, db, chain, wagmi, abi
scripts/            Agent runner + deploy script
data/               Local JSON state + storage fallback (gitignored)
```

## Security notes

- The pool is owned by whoever deploys it. `withdraw`, `paySalary`, and
  `payBatch` are `onlyEmployer`.
- Server-side auto-pay (`/api/payroll/run`) requires `EMPLOYER_PRIVATE_KEY`.
  For self-custodial usage, use the dashboard — it submits `payBatch` from
  the connected wallet instead.
- Employee-facing API is keyed on wallet address and only returns the
  caller's own records.
