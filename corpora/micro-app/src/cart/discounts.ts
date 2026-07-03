// Discount engine: percentage and threshold rules applied to cart totals.
import { Cart } from "./cart";
export interface DiscountRule { thresholdCents: number; percent: number }
export function applyBestDiscount(cart: Cart, rules: DiscountRule[]): number {
  const total = cart.totalCents();
  const eligible = rules.filter(r => total >= r.thresholdCents).sort((a, b) => b.percent - a.percent);
  const best = eligible[0];
  return best ? Math.round(total * (1 - best.percent / 100)) : total;
}
