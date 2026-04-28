import { defineChain } from "viem";

export const zgGalileo = defineChain({
  id: Number(process.env.NEXT_PUBLIC_ZG_CHAIN_ID ?? 16601),
  name: process.env.NEXT_PUBLIC_ZG_CHAIN_NAME ?? "0G-Galileo-Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "0G Chainscan",
      url: process.env.NEXT_PUBLIC_ZG_EXPLORER ?? "https://chainscan-galileo.0g.ai",
    },
  },
  fees: {
    defaultPriorityFee: 2_000_000_000n,
  },
  testnet: true,
});
