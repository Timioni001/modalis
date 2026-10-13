"use client";
import { useEffect, useState } from "react";
import { Card, Loading, Notice, SectionTitle } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { apiGet } from "@/lib/client-api";
import { motion } from "motion/react";

type Reply = {
  holdings: { token: string; symbol: string; units: string }[];
  checkedAt: string;
};
export function AssetQuantities() {
  const { address } = usePortfolio();
  const [data, setData] = useState<Reply | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    void apiGet<Reply>("/api/money/units", controller.signal)
      .then((reply) => {
        if (!controller.signal.aborted) setData(reply);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [address]);
  if (error)
    return (
      <Notice tone="warn">
        Asset quantities could not be read. No cached balance is being shown.
      </Notice>
    );
  if (!data) return <Loading label="Reading your asset quantities" />;
  return (
    <Card>
      <SectionTitle hint="Exact quantities from your plan. Dollar totals return when prices are available.">
        Assets in your plan
      </SectionTitle>
      <ul className="divide-y divide-line">
        {data.holdings.map((holding, index) => (
          <motion.li
            key={holding.token}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.025 }}
            className="flex items-start justify-between gap-4 py-4"
          >
            <span className="font-medium">{holding.symbol}</span>
            <span className="min-w-0 break-all text-right font-mono text-sm">
              {holding.units}
            </span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">
        Checked {new Date(data.checkedAt).toLocaleTimeString()} · test tokens
        have no monetary value.
      </p>
    </Card>
  );
}
