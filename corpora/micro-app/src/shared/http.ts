// Minimal HTTP client wrapper used by every service module.
export interface HttpResponse<T> { status: number; body: T }
export async function getJson<T>(url: string): Promise<HttpResponse<T>> {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as T };
}
export async function postJson<T>(url: string, payload: unknown): Promise<HttpResponse<T>> {
  const res = await fetch(url, { method: "POST", body: JSON.stringify(payload) });
  return { status: res.status, body: (await res.json()) as T };
}
