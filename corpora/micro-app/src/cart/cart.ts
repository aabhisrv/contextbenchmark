// Shopping cart: add/remove items, enforce the max-items limit from config.
import { config } from "../shared/config";
import { emit } from "../shared/events";
import { Product } from "../catalog/products";
export interface CartLine { product: Product; qty: number }
export class Cart {
  private lines: CartLine[] = [];
  add(product: Product, qty: number): void {
    if (this.lines.length >= config.maxCartItems) throw new Error("cart full");
    this.lines.push({ product, qty });
    emit("cart.changed", this.totalCents());
  }
  totalCents(): number {
    return this.lines.reduce((sum, l) => sum + l.product.priceCents * l.qty, 0);
  }
}
