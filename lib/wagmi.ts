"use client";

import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { zgGalileo } from "./chain";

export const wagmiConfig = createConfig({
  chains: [zgGalileo],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    // retryCount:0 prevents wagmi from hammering the 0G RPC when eth_estimateGas
    // times out; explicit gas limits in every tx call bypass simulation entirely.
    [zgGalileo.id]: http(undefined, { retryCount: 0, timeout: 30_000 }),
  },
  ssr: true,
});
