// Tiny synchronous event bus for cross-module notifications.
import { config } from "./config";
type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler[]>();
export function on(event: string, h: Handler): void {
  handlers.set(event, [...(handlers.get(event) ?? []), h]);
}
export function emit(event: string, payload: unknown): void {
  for (const h of handlers.get(event) ?? []) h(payload);
}
export const busName = `bus:${config.apiBase}`;
