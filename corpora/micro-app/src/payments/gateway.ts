// Payment gateway integration with bounded retries from config.
import { postJson } from "../shared/http";
import { config } from "../shared/config";
export interface Charge { id: string; amountCents: number; status: "ok" | "failed" }
export async function charge(amountCents: number, token: string): Promise<Charge> {
  let last: Charge = { id: "none", amountCents, status: "failed" };
  for (let i = 0; i < config.paymentRetryLimit; i++) {
    const res = await postJson<Charge>(`${config.apiBase}/charge`, { amountCents, token });
    last = res.body;
    if (last.status === "ok") break;
  }
  return last;
}
