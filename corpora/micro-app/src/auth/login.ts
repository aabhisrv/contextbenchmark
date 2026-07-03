// Login flow: verifies credentials against the API then opens a session.
import { getJson } from "../shared/http";
import { config } from "../shared/config";
import { createSession, Session } from "./session";
export async function login(userId: string, password: string): Promise<Session | null> {
  const res = await getJson<{ ok: boolean }>(`${config.apiBase}/auth?u=${userId}&p=${password}`);
  return res.body.ok ? createSession(userId) : null;
}
