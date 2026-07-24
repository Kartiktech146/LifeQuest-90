export async function sendSmsOtp(to: string, code: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error("SMS_PROVIDER_NOT_CONFIGURED");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: to, From: from, Body: `Your LifeQuest OTP is ${code}. It expires in 10 minutes.` }) });
  if (!response.ok) throw new Error("SMS_SEND_FAILED");
}
