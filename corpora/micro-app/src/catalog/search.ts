// Full-text product search with simple ranking by name match position.
import { getJson } from "../shared/http";
import { config } from "../shared/config";
import { Product } from "./products";
export async function searchProducts(term: string): Promise<Product[]> {
  const res = await getJson<Product[]>(`${config.apiBase}/search?q=${encodeURIComponent(term)}`);
  return res.body.sort((a, b) => a.name.indexOf(term) - b.name.indexOf(term));
}
