# LifeQuest authentication setup

## 1. Create the local environment file

Copy `.env.example` to `.env.local`. Generate `AUTH_SECRET` with at least 32 random characters and never commit `.env.local`.

## 2. Gmail OTP

Create a Google Cloud project, enable the Gmail API, create an OAuth client, and obtain a refresh token for the Gmail account that will send OTP messages. Fill:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_FROM_EMAIL`

The sender account must authorize the Gmail send scope. The API key is never sent to the browser.

## 3. SMS OTP

The included provider uses Twilio's HTTPS API. A trial account can be used for testing, but it is not unlimited free SMS and normally sends only to verified trial numbers. Fill:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

To use another provider, replace only `lib/providers/sms.ts`; the authentication routes do not need to change.

## 4. Database

For local development, the required D1 tables are created automatically on the
first database-backed request. The SQL files in `drizzle/` are retained for
managed production deployments and schema review.

## Security behaviour

- Six-digit OTP expires after 10 minutes.
- One OTP request per destination per minute.
- Maximum five verification attempts.
- OTP is stored as a keyed hash, never as plain text.
- Login session is a 30-day Secure, HttpOnly, SameSite cookie.
- Logout revokes the current server session.
- Delete Account requires typing `DELETE` and removes the user, state, and sessions.
