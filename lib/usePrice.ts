"use client";

import { useEffect, useState } from "react";

export function use0GPrice(): number | null {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/price")
      .then((r) => r.json())
      .then((j) => { if (j.usd) setPrice(j.usd); })
      .catch(() => {});
  }, []);

  return price;
}
