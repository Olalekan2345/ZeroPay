#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const SRC     = path.join("contracts", "SecuredVault.sol");
const OUT_DIR = path.join("contracts", "out");

if (!fs.existsSync(SRC)) {
  console.error("Missing", SRC);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const source = fs.readFileSync(SRC, "utf8");
const input = {
  language: "Solidity",
  sources: { "SecuredVault.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

console.log("Compiling SecuredVault.sol with solc", solc.version());
const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of output.errors ?? []) {
  if (w.severity === "warning") console.warn(w.formattedMessage);
}

const contract = output.contracts["SecuredVault.sol"].SecuredVault;
fs.writeFileSync(path.join(OUT_DIR, "PayrollPool.bin"), contract.evm.bytecode.object);
fs.writeFileSync(path.join(OUT_DIR, "PayrollPool.abi"), JSON.stringify(contract.abi, null, 2));
console.log("✓ contracts/out/PayrollPool.bin");
console.log("✓ contracts/out/PayrollPool.abi");
