import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * 0G Storage client with local fallback.
 *
 * - When EMPLOYER_PRIVATE_KEY + NEXT_PUBLIC_ZG_STORAGE_INDEXER are set, we
 *   upload via `@0glabs/0g-ts-sdk` and return the Merkle root as the ref.
 * - Otherwise we persist to ./data/storage/<hash>.json and return a
 *   deterministic content hash prefixed with "local:". This keeps the product
 *   usable in development without credentials.
 *
 * All ZeroPay records (employees, attendance entries, payroll reports) pass
 * through this module, which is the single integration point with 0G Storage.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_DIR = path.join(DATA_DIR, "storage");
const TMP_STORAGE_DIR = path.join("/tmp", "zp-storage");

async function ensureDirs(): Promise<string> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    // Verify writability with a quick probe
    const probe = path.join(STORAGE_DIR, ".probe");
    await fs.writeFile(probe, "");
    await fs.unlink(probe);
    return STORAGE_DIR;
  } catch {
    // Vercel and other read-only filesystems: fall back to /tmp
    await fs.mkdir(TMP_STORAGE_DIR, { recursive: true });
    return TMP_STORAGE_DIR;
  }
}

function hashContent(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function uploadToZG(buf: Buffer, storageDir: string): Promise<string | null> {
  const pk = process.env.EMPLOYER_PRIVATE_KEY;
  const indexer = process.env.NEXT_PUBLIC_ZG_STORAGE_INDEXER;
  const rpc = process.env.NEXT_PUBLIC_ZG_RPC_URL;
  if (!pk || !indexer || !rpc) return null;

  try {
    const sdk: any = await import("@0glabs/0g-ts-sdk");
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer = new ethers.Wallet(pk, provider);
    const Indexer = sdk.Indexer ?? sdk.default?.Indexer;
    const ZgFile = sdk.ZgFile ?? sdk.default?.ZgFile;
    if (!Indexer || !ZgFile) return null;

    const tmp = path.join(storageDir, `upload-${Date.now()}.bin`);
    await fs.writeFile(tmp, buf);
    try {
      const file = await ZgFile.fromFilePath(tmp);
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr) throw treeErr;
      const rootHash: string = tree.rootHash();
      const idx = new Indexer(indexer);
      const [, uploadErr] = await idx.upload(file, rpc, signer);
      await file.close?.();
      if (uploadErr) throw uploadErr;
      return rootHash;
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  } catch (err) {
    console.warn("[storage] 0G upload failed, falling back:", (err as Error).message);
    return null;
  }
}

export async function putJSON(obj: unknown): Promise<string> {
  const dir = await ensureDirs();
  const payload = Buffer.from(JSON.stringify(obj, null, 2), "utf8");

  const zgRoot = await uploadToZG(payload, dir);
  if (zgRoot) {
    await fs.writeFile(path.join(dir, `${zgRoot}.json`), payload).catch(() => {});
    return `0g:${zgRoot}`;
  }

  const h = hashContent(payload);
  await fs.writeFile(path.join(dir, `${h}.json`), payload);
  return `local:${h}`;
}

export async function getJSON<T = unknown>(ref: string): Promise<T | null> {
  const dir = await ensureDirs();
  const id = ref.replace(/^(0g:|local:)/, "");
  for (const d of [dir, STORAGE_DIR, TMP_STORAGE_DIR]) {
    try {
      const raw = await fs.readFile(path.join(d, `${id}.json`), "utf8");
      return JSON.parse(raw) as T;
    } catch { /* try next */ }
  }
  return null;
}
