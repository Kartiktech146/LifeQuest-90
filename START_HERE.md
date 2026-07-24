# LifeQuest 90 — easiest local setup

This folder already contains the connected frontend, authentication backend,
database, Gmail OTP adapter, SMS OTP adapter, Quest AI route, logout, and
delete-account flow. You do not need to merge any files.

## Use VS Code with WSL (recommended on Windows)

1. Copy this project to your WSL home folder and open it in VS Code.
2. Install Node.js 22.
3. In the VS Code terminal run:

```bash
npm ci
cp .env.example .env.local
```

4. Open `.env.local` and fill the values. For the free Quest AI provider, add
   `GROQ_API_KEY` and keep `GROQ_MODEL=openai/gpt-oss-120b`. Never upload this
   file to GitHub.
5. Start the app:

```bash
npm run dev
```

6. Open the local URL printed in the terminal (normally
   `http://localhost:5173`). The local database tables are created
   automatically on the first login request.

## Required values

Generate the authentication secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste it as `AUTH_SECRET`. Add Gmail API OAuth credentials for email OTP,
Twilio credentials for mobile OTP, and an OpenAI API key for Quest AI.

## What works after configuration

- Gmail OTP signup/login
- Mobile OTP signup/login (Twilio trial restrictions apply)
- Secure HttpOnly login session
- Server-side logout
- Permanent account deletion
- Separate saved LifeQuest state for every account
- Real API-powered Quest AI

## Important distinction

"Login with Gmail OTP" sends a six-digit code to a Gmail address. It is not the
Google OAuth popup. SMS is normally not permanently free; Twilio trial credits
are suitable for initial testing.

If an environment value changes, stop the server with `Ctrl+C` and run
`npm run dev` again.
