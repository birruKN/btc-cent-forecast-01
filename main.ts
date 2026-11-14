// btc-cent-forecast-01: forecast the BTC/USDC close 240 minutes ahead.
//
// Model: a 24-hour log-mean reversion. Given the series of one-minute
// closes ending at the checkpoint, take the mean of log(price) over the
// last 1,440 closes (or all closes if fewer), then pull the last price
// 35% of the way (in log space) toward that mean:
//
//   forecast = last * exp(0.35 * (meanLog - log(last)))
//
// The result is clamped to the competition's valid range and rounded to
// 5 decimals. Fully deterministic, standard library only, no network.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const REVERSION = 0.35;
const WINDOW = 1440;
const MIN_PRICE = 0.00001;
const MAX_PRICE = 9999999.99999;

function forecast(prices: number[]): number {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length === 0) return 1;
  const last = valid[valid.length - 1];
  const window = valid.slice(-WINDOW);
  let sumLog = 0;
  for (const p of window) sumLog += Math.log(p);
  const meanLog = sumLog / window.length;
  const raw = last * Math.exp(REVERSION * (meanLog - Math.log(last)));
  const clamped = Math.min(MAX_PRICE, Math.max(MIN_PRICE, raw));
  return Number(clamped.toFixed(5));
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const cases = readdirSync(INPUT_DIR)
    .filter((name) => name.endsWith(".in"))
    .sort();
  for (const name of cases) {
    let data: { case?: string; markets?: { id: string; prices: number[] }[] };
    try {
      data = JSON.parse(readFileSync(join(INPUT_DIR, name), "utf8"));
    } catch (err) {
      console.error(`skipping ${name}: unreadable case file (${err})`);
      continue;
    }
    const caseId = data.case ?? name.replace(/\.in$/, "");
    const market = data.markets?.find((m) => m.id === "btc-usdc") ?? data.markets?.[0];
    if (!market || !Array.isArray(market.prices)) {
      // A case with no usable price series cannot be forecast; skip it
      // with a warning instead of crashing the whole batch and losing
      // every other case.
      console.error(`skipping ${name}: no price series for case ${caseId}`);
      continue;
    }
    const price = forecast(market.prices);
    const out = { forecasts: [{ case: caseId, price }] };
    const outName = name.replace(/\.in$/, ".out");
    writeFileSync(join(OUTPUT_DIR, outName), JSON.stringify(out) + "\n");
  }
}

main();
