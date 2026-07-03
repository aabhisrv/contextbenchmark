// Central configuration: every module reads limits and endpoints from here.
export const config = {
  apiBase: "https://api.example.test",
  maxCartItems: 50,
  sessionTtlMinutes: 30,
  currency: "EUR",
  paymentRetryLimit: 3,
};
export type Config = typeof config;
