/**
 * Verifies the incoming webhook request against WEBHOOK_SECRET env var.
 * Checks header X-Webhook-Secret or query param ?s=
 * If WEBHOOK_SECRET is not set, skips the check (backward-compatible).
 * Returns true if request is authorized.
 */
export function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // Not configured — allow (set the env var to enforce)

  const url = new URL(request.url);
  const fromHeader = request.headers.get("x-webhook-secret");
  const fromQuery  = url.searchParams.get("s");

  return fromHeader === secret || fromQuery === secret;
}
