import { RATES } from './rates.js';

// All amounts in whole pence. Estimates only.
export function corporationTax(profitPence, periodDays = 365, associated = 0) {
  if (!(profitPence > 0)) return 0;
  const { smallRate, mainRate, lowerLimit, upperLimit, reliefFraction } = RATES.ct;
  const share = periodDays / 365 / (associated + 1);
  const lower = lowerLimit * share, upper = upperLimit * share;
  let tax;
  if (profitPence <= lower) tax = profitPence * smallRate;
  else if (profitPence >= upper) tax = profitPence * mainRate;
  else tax = profitPence * mainRate - reliefFraction * (upper - profitPence);
  return Math.round(tax);
}

export function dividendTax(dividendPence, otherIncomePence = 0) {
  if (!(dividendPence > 0)) return 0;
  const d = RATES.dividend;
  const total = otherIncomePence + dividendPence;
  const pa = Math.max(0, d.personalAllowance - Math.max(0, total - d.taperStart) / 2);
  const bands = [[pa, 0], [pa + d.basicBandWidth, d.basic], [d.additionalThreshold, d.higher], [Infinity, d.additional]];
  const slices = [];
  let from = otherIncomePence, bandStart = 0;
  for (const [top, rate] of bands) {
    const lo = Math.max(from, bandStart), hi = Math.min(total, top);
    if (hi > lo) slices.push([hi - lo, rate]);
    bandStart = top;
  }
  let allowance = d.allowance, tax = 0;
  for (const [amount, rate] of slices) {
    let taxable = amount;
    if (rate > 0 && allowance > 0) { const used = Math.min(allowance, taxable); allowance -= used; taxable -= used; }
    tax += taxable * rate;
  }
  return Math.round(tax);
}

export function safeToPayOut({ profitPence, ctPence, dividendsPaidPence = 0 }) {
  return Math.max(0, profitPence - ctPence - dividendsPaidPence);
}
