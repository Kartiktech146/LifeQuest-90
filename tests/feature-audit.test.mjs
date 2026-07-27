import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const pwaRegisterSource = await readFile(new URL("../app/pwa-register.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const authSource = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
const assistantRouteSource = await readFile(new URL("../app/api/assistant/route.ts", import.meta.url), "utf8");
const requestOtpRouteSource = await readFile(new URL("../app/api/auth/request-otp/route.ts", import.meta.url), "utf8");

test("every navigation option has a rendered working module", () => {
  const tabs = ["overview", "reset", "planner", "revision", "alarm", "reminders", "gym", "expenses", "rewards", "change", "history", "settings"];
  for (const tab of tabs) assert.match(pageSource, new RegExp(`active === ["']${tab}["']`), `${tab} is not rendered`);

  const modules = ["Overview", "ResetModule", "PlannerModule", "RevisionModule", "AlarmModule", "ReminderModule", "GymModule", "ExpenseModule", "RewardModule", "ChangeModule", "HistoryModule", "SettingsModule"];
  for (const moduleName of modules) assert.match(pageSource, new RegExp(`function ${moduleName}\\(`), `${moduleName} is missing`);
});

test("reminders, install flow and readable mobile navigation are wired", () => {
  assert.match(pageSource, /function isReminderDue/);
  assert.match(pageSource, /window\.setInterval\(checkReminders,\s*15_000\)/);
  assert.match(pageSource, /beforeinstallprompt/);
  assert.doesNotMatch(pageSource, /className="install-login"/);
  assert.match(pageSource, /function InstallAppGuide/);
  assert.match(pageSource, /function detectInstallPlatform/);
  assert.match(pageSource, /SHOW INSTALL STEPS/);
  assert.match(pwaRegisterSource, /lifequest-install-ready/);
  assert.match(styleSource, /\.install-guide-backdrop\{[^}]*z-index:4000/);
  assert.match(serviceWorkerSource, /lifequest-90-v4/);
  assert.match(styleSource, /\.nav-label\{display:block;font-size:10px!important\}/);
  assert.doesNotMatch(styleSource, /\.nav-item\{font-size:0!important/);
  assert.match(authSource, /60 \* 60 \* 24 \* 90/);
  assert.match(authSource, /Expires=\$\{expires\}/);
});

test("alarm has a scheduler, sound, notification and dismissal missions", () => {
  assert.match(pageSource, /function isAlarmDue/);
  assert.match(pageSource, /window\.setInterval\(checkAlarms,\s*1_000\)/);
  assert.match(pageSource, /function AlarmMission/);
  assert.match(pageSource, /registration\.showNotification/);
  assert.match(pageSource, /createOscillator/);
  assert.match(pageSource, /20-tap wake check/);
  assert.match(serviceWorkerSource, /notificationclick/);
});

test("progress and finance controls update real state safely", () => {
  assert.match(pageSource, /focusMinutes:\s*Math\.max/);
  assert.match(pageSource, /coinMultiplier/);
  assert.match(pageSource, /morningClaimedOn/);
  assert.match(pageSource, /cooldownReady/);
  assert.match(pageSource, /budgetPercent = state\.expenses\.budget > 0/);
  assert.match(pageSource, /Object\.keys\(answers\)\.length !== questions\.length/);
});

test("AI and both OTP providers are connected through server routes", () => {
  assert.match(assistantRouteSource, /OPENAI_API_KEY|GROQ_API_KEY|GEMINI_API_KEY/);
  assert.match(requestOtpRouteSource, /sendGmailOtp/);
  assert.match(requestOtpRouteSource, /sendSmsOtp/);
});

test("Gmail and mobile OTP can be resent after a real 15-second cooldown", () => {
  assert.match(pageSource, /setResendIn\(15\)/);
  assert.match(pageSource, /RESEND \$\{pendingMethod === "google" \? "GMAIL" : "MOBILE"\} OTP/);
  assert.match(pageSource, /requestOtp\(pendingMethod\)/);
  assert.match(requestOtpRouteSource, /Date\.now\(\) - 15_000/);
  assert.match(requestOtpRouteSource, /isNull\(otpChallenges\.consumedAt\)/);
});
