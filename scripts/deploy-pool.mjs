#!/usr/bin/env node
/**
 * Deploys PayrollPool.sol to 0G Galileo testnet.
 *
 * Requires:
 *   - solc installed (`npm i -g solc`) OR precompiled bytecode at contracts/out/PayrollPool.bin
 *   - EMPLOYER_PRIVATE_KEY in .env (the deployer becomes the employer)
 *
 * Usage:  node scripts/deploy-pool.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import "dotenv/config";

const rpc = process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const pk = process.env.EMPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error("Set EMPLOYER_PRIVATE_KEY in .env");
  process.exit(1);
}

const BIN_PATH = path.join("contracts", "out", "PayrollPool.bin");
const ABI_PATH = path.join("contracts", "out", "PayrollPool.abi");
if (!existsSync(BIN_PATH) || !existsSync(ABI_PATH)) {
  console.error(
    `Missing compiled artifacts. Run "npm run compile" first.`,
  );
  process.exit(1);
}

const bytecode = "0x" + readFileSync(BIN_PATH, "utf8").trim();
const abi = JSON.parse(readFileSync(ABI_PATH, "utf8"));
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : "0x" + pk, provider);

// owner = platform key (also the deployer), operator = platform key
// For production, pass a separate owner address as argv[2]
const ownerArg    = process.argv[2];
const ownerAddress = ownerArg
  ? ethers.getAddress(ownerArg)
  : wallet.address;

console.log("Deploying SecuredVault from", wallet.address);
console.log("  owner   :", ownerAddress);
console.log("  operator:", wallet.address);
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const c = await factory.deploy(ownerAddress, wallet.address);
await c.waitForDeployment();
const addr = await c.getAddress();
console.log("SecuredVault deployed at:", addr);
console.log("Set NEXT_PUBLIC_PAYROLL_POOL_ADDRESS=" + addr);
