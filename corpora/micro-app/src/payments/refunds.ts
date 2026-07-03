// Refund processing: validates the charge then posts the reversal.
import { postJson } from "../shared/http";
import { config } from "../shared/config";
import { Charge } from "./gateway";
export async function refund(chargeItem: Charge): Promise<boolean> {
  if (chargeItem.status !== "ok") return false;
  const res = await postJson<{ ok: boolean }>(`${config.apiBase}/refund`, { id: chargeItem.id });
  return res.body.ok;
}
