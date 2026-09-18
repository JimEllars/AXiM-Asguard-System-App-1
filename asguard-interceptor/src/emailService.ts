export interface Env {
  EMAILIT_API_KEY: string;
  THREAT_DLQ_KV?: any;
}

export async function sendEmailItMessage(env: Env, to: string | string[], bcc: string | string[], subject: string, html: string) {
  const payload = {
    from: "System Alerts <alerts@axim.us.com>",
    to: Array.isArray(to) ? to : [to],
    bcc: Array.isArray(bcc) ? bcc : [bcc],
    subject,
    html,
  };

  try {
    const response = await fetch("https://api.emailit.com/v1/email/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.EMAILIT_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status >= 500 || response.status === 408) {
         throw new Error(`EmailIt HTTP Error: ${response.status}`);
      }
    }
    return true;
  } catch (error: any) {
    if (env.THREAT_DLQ_KV) {
       await env.THREAT_DLQ_KV.put(`email_dlq:${Date.now()}`, JSON.stringify({
         timestamp: Date.now(),
         payload
       }));
    }
    return false;
  }
}
