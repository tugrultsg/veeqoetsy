import { Env } from "../env";

export async function sendAlert(
  env: Env,
  subject: string,
  body: string
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) {
    console.log(`[ALERT] ${subject}: ${body}`);
    return;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Etsy-Veeqo Sync <onboarding@resend.dev>",
        to: [env.ALERT_EMAIL],
        subject: `[Etsy-Veeqo] ${subject}`,
        text: body,
      }),
    });

    if (!resp.ok) {
      console.error(`Email send failed: ${resp.status} ${await resp.text()}`);
    }
  } catch (e) {
    console.error(`Email send error: ${e}`);
  }
}

export async function alertSyncFailure(
  env: Env,
  shopName: string,
  syncType: string,
  error: string
): Promise<void> {
  await sendAlert(
    env,
    `Sync Failed: ${shopName} - ${syncType}`,
    `Shop: ${shopName}\nSync type: ${syncType}\nError: ${error}\n\nCheck dashboard for details.`
  );
}
