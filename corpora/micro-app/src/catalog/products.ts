// Product catalog access and in-memory caching of product listings.
import { getJson } from "../shared/http";
import { config } from "../shared/config";
export interface Product { id: string; name: string; priceCents: number }
const cache = new Map<string, Product>();
export async function getProduct(id: string): Promise<Product | undefined> {
  if (cache.has(id)) return cache.get(id);
  const res = await getJson<Product>(`${config.apiBase}/products/${id}`);
  if (res.status === 200) cache.set(id, res.body);
  return res.body;
}
export function clearCatalogCache(): void { cache.clear(); }
