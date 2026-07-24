function base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmailOtp(to: string, code: string) {
  const clientId = process.env.GMAIL_CLIENT_ID, clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN, from = process.env.GMAIL_FROM_EMAIL;
  if (!clientId || !clientSecret || !refreshToken || !from) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  if (!tokenResponse.ok) throw new Error("EMAIL_TOKEN_FAILED");
  const { access_token } = await tokenResponse.json() as { access_token: string };
  const message = [`From: LifeQuest <${from}>`, `To: ${to}`, "Subject: Your LifeQuest verification code", "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", `Your LifeQuest OTP is ${code}. It expires in 10 minutes. Never share this code.`].join("\r\n");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" }, body: JSON.stringify({ raw: base64Url(message) }) });
  if (!response.ok) throw new Error("EMAIL_SEND_FAILED");
}
