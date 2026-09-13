/**
 * Typed access to environment variables.
 * `env.required()` throws at call time (not import time) so builds succeed
 * without secrets and misconfiguration surfaces as a clear runtime error.
 */
export const env = {
  get(name: string, fallback?: string): string | undefined {
    const v = process.env[name];
    return v === undefined || v === "" ? fallback : v;
  },
  required(name: string): string {
    const v = process.env[name];
    if (v === undefined || v === "") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return v;
  },
  bool(name: string, fallback = false): boolean {
    const v = process.env[name];
    if (v === undefined || v === "") return fallback;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  },
  appUrl(): string {
    return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  models(): { chat: string; fast: string } {
    return {
      chat: process.env.CLAUDE_MODEL_CHAT ?? "claude-opus-5",
      fast: process.env.CLAUDE_MODEL_FAST ?? "claude-haiku-4-5",
    };
  },
};
