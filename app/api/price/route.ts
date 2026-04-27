import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Cache for 3 minutes so we don't hammer CoinGecko
let cache: { usd: number; fetchedAt: number } | null = null;
const TTL = 3 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < TTL) {
    return NextResponse.json({ usd: cache.usd });
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=zero-gravity&vs_currencies=usd",
      { next: { revalidate: 180 } },
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const json = await res.json();
    const usd: number = json["zero-gravity"]?.usd;
    if (!usd) throw new Error("price not in response");
    cache = { usd, fetchedAt: Date.now() };
    return NextResponse.json({ usd });
  } catch (err) {
    // Return null price gracefully — UI will just not show the $ figure
    return NextResponse.json({ usd: null, error: (err as Error).message });
  }
}
