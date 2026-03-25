export interface Env {
  DB: D1Database;
  OAUTH_STATE: KVNamespace;
  ASSETS: Fetcher;

  // Secrets
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string; // 64 hex chars (32 bytes)

  // Optional
  RESEND_API_KEY?: string;
  ALERT_EMAIL?: string;
  WORKER_URL: string;
}
