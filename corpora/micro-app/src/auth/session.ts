// Session lifecycle: creation, validation, expiry based on config TTL.
import { config } from "../shared/config";
import { emit } from "../shared/events";
export interface Session { token: string; userId: string; expiresAt: number }
export function createSession(userId: string): Session {
  const s = { token: `t_${userId}`, userId, expiresAt: Date.now() + config.sessionTtlMinutes * 60_000 };
  emit("session.created", s);
  return s;
}
export function isSessionValid(s: Session): boolean {
  return s.expiresAt > Date.now();
}
