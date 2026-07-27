"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tab = "overview" | "reset" | "planner" | "revision" | "alarm" | "reminders" | "gym" | "expenses" | "rewards" | "change" | "history" | "settings";
type Task = { id: number; title: string; duration: number; priority: "High" | "Medium" | "Low"; start: string; done: boolean; xp: number };
type Habit = { id: number; name: string; streak: number; done: boolean; reward: number };
type Revision = { id: number; title: string; url: string; nextReview: string; reviewDate?: string; mastery: number; level: number; done: boolean };
type Alarm = { id: number; time: string; label: string; mission: string; enabled: boolean };
type Reminder = { id: number; title: string; date: string; time: string; repeat: "once" | "daily"; enabled: boolean };
type Expense = { id: number; title: string; category: string; amount: number; date: string };
type Reward = { id: number; title: string; emoji: string; cost: number; cooldown: string; redeemed: number; lastRedeemedOn?: string };
type StoreItem = { id: string; name: string; icon: string; kind: "theme" | "sticker" | "badge" | "effect"; cost: number; rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY"; description: string; theme?: "cyber" | "royal" | "stealth" };
type Exercise = { id: number; name: string; sets: number; reps: string; done: boolean };
type WorkoutDay = { day: string; muscles: string; exercises: Exercise[]; complete: boolean };
type ChangeHabit = { id: number; name: string; type: "build" | "break"; identity: string; cue: string; action: string; streak: number; done: boolean };
type AssistantMessage = { role: "ai" | "user"; text: string };
type Recommendation = { code: string; title: string; detail: string; action: string; tab: Tab; tone: "cyan" | "lime" | "amber" | "purple" };
type DayLog = { date: string; tasks: { title: string; done: boolean }[]; habits: { title: string; done: boolean }[] };
type AppAccount = { id: string; name: string; method: "mobile" | "google"; label: string; createdAt?: string };
type AlarmPermission = NotificationPermission | "unsupported";
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type InstallPlatform = "ios" | "android" | "desktop" | "other";
type InstallWindow = Window & { lifeQuestInstallPrompt?: InstallPromptEvent };

function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent)) return "ios";
  if (/android/.test(agent)) return "android";
  if (/windows|macintosh|linux/.test(agent)) return "desktop";
  return "other";
}

type LifeQuestState = {
  profile: {
    name: string;
    day: number;
    xp: number;
    coins: number;
    streak: number;
    focusMinutes: number;
    journeyStartedOn?: string;
    lastActiveDate?: string;
  };
  tasks: Task[];
  habits: Habit[];
  revisions: Revision[];
  alarms: Alarm[];
  reminders: Reminder[];
  expenses: { budget: number; items: Expense[] };
  rewards: Reward[];
  store?: { owned: string[]; equipped: Partial<Record<StoreItem["kind"], string>> };
  workouts: WorkoutDay[];
  changeHabits: ChangeHabit[];
  checkin: { morning: string; evening: string; energy: number; morningClaimedOn?: string; eveningClaimedOn?: string };
  settings: { theme: "cyber" | "royal" | "stealth"; compact: boolean; sound: boolean; dailyGoal: number; coinMultiplier: number };
  history: DayLog[];
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDateKey(value: string, days: number) {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function daysBetween(startedOn: string, today: string) {
  const start = dateFromKey(startedOn);
  const current = dateFromKey(today);
  return Math.floor((Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);
}

function campaignDay(startedOn: string, today: string) {
  const elapsed = daysBetween(startedOn, today);
  return Math.min(90, Math.max(1, elapsed + 1));
}

function revisionDate(item: Revision, today: string) {
  if (item.reviewDate && DATE_KEY_PATTERN.test(item.reviewDate)) return item.reviewDate;
  if (item.nextReview === "Today") return today;
  if (item.nextReview === "Tomorrow") return shiftDateKey(today, 1);
  return undefined;
}

function revisionLabel(item: Revision, today: string) {
  const due = revisionDate(item, today);
  if (!due) return item.nextReview;
  if (due <= today) return due === today ? "Today" : "Overdue";
  if (due === shiftDateKey(today, 1)) return "Tomorrow";
  return dateFromKey(due).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function syncStateToDate(current: LifeQuestState, today: string, accountStartedOn?: string): LifeQuestState {
  const savedDay = Math.min(90, Math.max(1, Number(current.profile.day) || 1));
  const journeyStartedOn = current.profile.journeyStartedOn && DATE_KEY_PATTERN.test(current.profile.journeyStartedOn)
    ? current.profile.journeyStartedOn
    : accountStartedOn && DATE_KEY_PATTERN.test(accountStartedOn)
      ? accountStartedOn
      : shiftDateKey(today, -(savedDay - 1));
  const day = campaignDay(journeyStartedOn, today);
  const lastActiveDate = current.profile.lastActiveDate && DATE_KEY_PATTERN.test(current.profile.lastActiveDate)
    ? current.profile.lastActiveDate
    : today;
  const revisions = current.revisions.map((item) => {
    const reviewDate = revisionDate(item, lastActiveDate);
    return reviewDate && item.reviewDate !== reviewDate ? { ...item, reviewDate } : item;
  });
  const revisionsChanged = revisions.some((item, index) => item !== current.revisions[index]);

  if (lastActiveDate === today) {
    if (current.profile.day === day && current.profile.journeyStartedOn === journeyStartedOn && current.profile.lastActiveDate === today && !revisionsChanged) return current;
    return { ...current, profile: { ...current.profile, day, journeyStartedOn, lastActiveDate: today }, revisions };
  }

  const previousLog: DayLog = {
    date: lastActiveDate,
    tasks: current.tasks.map((item) => ({ title: item.title, done: item.done })),
    habits: current.habits.map((item) => ({ title: item.name, done: item.done })),
  };
  const history = [...(current.history || []).filter((item) => item.date !== lastActiveDate), previousLog]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);
  const currentDayCode = dateFromKey(today).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const elapsedDays = daysBetween(lastActiveDate, today);
  const completedPriorities = current.tasks.filter((item) => item.done && item.priority === "High").length;
  const dayGoalMet = completedPriorities >= (current.settings?.dailyGoal || 3);

  return {
    ...current,
    profile: { ...current.profile, day, journeyStartedOn, lastActiveDate: today, streak: elapsedDays === 1 && dayGoalMet ? current.profile.streak + 1 : 0 },
    tasks: current.tasks.map((item) => ({ ...item, done: false })),
    habits: current.habits.map((item) => ({ ...item, done: false, streak: elapsedDays === 1 && item.done ? item.streak : 0 })),
    revisions: revisions.map((item) => ({ ...item, done: false })),
    changeHabits: current.changeHabits.map((item) => ({ ...item, done: false, streak: elapsedDays === 1 && item.done ? item.streak : 0 })),
    workouts: current.workouts.map((item) => item.day === currentDayCode
      ? { ...item, complete: false, exercises: item.exercises.map((exercise) => ({ ...exercise, done: false })) }
      : item),
    checkin: { ...current.checkin, morning: "", evening: "" },
    history,
  };
}

function createInitialState(name = "Player", startedOn = ""): LifeQuestState {
  const displayName = name.trim() || "Player";
  return {
    profile: { name: displayName, day: 1, xp: 0, coins: 0, streak: 0, focusMinutes: 0, journeyStartedOn: startedOn, lastActiveDate: startedOn },
    tasks: [
      { id: 1, title: "Plan today's top priority", duration: 15, priority: "High", start: "08:00", done: false, xp: 30 },
      { id: 2, title: "Complete one focused work session", duration: 60, priority: "High", start: "10:00", done: false, xp: 80 },
      { id: 3, title: "Move your body", duration: 30, priority: "Medium", start: "17:00", done: false, xp: 50 },
      { id: 4, title: "Review the day", duration: 15, priority: "Low", start: "21:00", done: false, xp: 25 },
    ],
    habits: [
      { id: 1, name: "Drink enough water", streak: 0, done: false, reward: 15 },
      { id: 2, name: "Read for 20 minutes", streak: 0, done: false, reward: 15 },
      { id: 3, name: "Avoid distractions during focus time", streak: 0, done: false, reward: 20 },
      { id: 4, name: "Reflect before sleeping", streak: 0, done: false, reward: 15 },
    ],
    revisions: [],
    alarms: [
      { id: 1, time: "07:00", label: "Start the day", mission: "Open LifeQuest", enabled: false },
    ],
    reminders: [],
    expenses: { budget: 0, items: [] },
    rewards: [
      { id: 1, title: "Take a guilt-free break", emoji: "☕", cost: 100, cooldown: "Once a day", redeemed: 0 },
      { id: 2, title: "Watch one episode", emoji: "🍿", cost: 200, cooldown: "Once a day", redeemed: 0 },
      { id: 3, title: "Enjoy your favourite snack", emoji: "🍦", cost: 240, cooldown: "Once a week", redeemed: 0 },
      { id: 4, title: "Buy something special", emoji: "🎁", cost: 1200, cooldown: "Level reward", redeemed: 0 },
    ],
    store: { owned: ["theme-cyber", "sticker-focus"], equipped: { theme: "theme-cyber", sticker: "sticker-focus" } },
    workouts: [
      { day: "MON", muscles: "Chest + Triceps", complete: false, exercises: [{ id: 1, name: "Bench press", sets: 4, reps: "8–10", done: false }, { id: 2, name: "Incline dumbbell press", sets: 3, reps: "10–12", done: false }] },
      { day: "TUE", muscles: "Back + Biceps", complete: false, exercises: [{ id: 3, name: "Lat pulldown", sets: 4, reps: "10", done: false }] },
      { day: "WED", muscles: "Legs + Core", complete: false, exercises: [{ id: 4, name: "Squat", sets: 4, reps: "8–10", done: false }, { id: 5, name: "Leg press", sets: 3, reps: "12", done: false }, { id: 6, name: "Plank", sets: 3, reps: "45 sec", done: false }] },
      { day: "THU", muscles: "Shoulders", complete: false, exercises: [{ id: 7, name: "Overhead press", sets: 4, reps: "8–10", done: false }] },
      { day: "FRI", muscles: "Upper Body", complete: false, exercises: [{ id: 8, name: "Pull-ups", sets: 4, reps: "AMRAP", done: false }] },
      { day: "SAT", muscles: "Cardio + Mobility", complete: false, exercises: [{ id: 9, name: "Zone 2 cardio", sets: 1, reps: "30 min", done: false }] },
      { day: "SUN", muscles: "Recovery", complete: false, exercises: [{ id: 10, name: "Full-body mobility", sets: 1, reps: "20 min", done: false }] },
    ],
    changeHabits: [
      { id: 1, name: "Daily focused work", type: "build", identity: "I protect time for what matters", cue: "At my planned focus time", action: "Work without distractions for two minutes", streak: 0, done: false },
      { id: 2, name: "Late-night scrolling", type: "break", identity: "I protect my sleep", cue: "Phone in bed", action: "Charge the phone away from the bed", streak: 0, done: false },
    ],
    checkin: { morning: "", evening: "", energy: 3 },
    settings: { theme: "cyber", compact: false, sound: true, dailyGoal: 2, coinMultiplier: 1 },
    history: [],
  };
}

const DEFAULT_STATE = createInitialState();

function playerLevel(xp: number) {
  return Math.floor(Math.max(0, xp) / 1000) + 1;
}

function playerRank(xp: number) {
  const level = playerLevel(xp);
  if (level >= 10) return "LEGEND";
  if (level >= 7) return "COMMANDER";
  if (level >= 4) return "CHALLENGER";
  if (level >= 2) return "BUILDER";
  return "ROOKIE";
}

function playerInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "P";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
}

function alarmMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
}

function isAlarmDue(alarm: Alarm, now: Date) {
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const elapsed = currentMinutes - alarmMinutes(alarm.time);
  return alarm.enabled && elapsed >= 0 && elapsed < 5;
}

function isReminderDue(reminder: Reminder, now: Date) {
  if (!reminder.enabled) return false;
  const today = localDateKey(now);
  if (reminder.repeat === "once" && reminder.date !== today) return false;
  if (reminder.repeat === "daily" && reminder.date && reminder.date > today) return false;
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const elapsed = currentMinutes - alarmMinutes(reminder.time);
  return elapsed >= 0 && elapsed < 5;
}

function isLegacyDemoState(state: LifeQuestState, account: AppAccount) {
  const accountLooksLikeKartik = account.name.trim().toLowerCase().startsWith("kartik");
  return !accountLooksLikeKartik
    && state.profile?.name === "Kartik"
    && state.tasks?.some((task) => task.title === "Deep work: Machine Learning")
    && state.expenses?.items?.some((item) => item.title === "Room rent");
}

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "overview", icon: "⌂", label: "Command Center" },
  { id: "reset", icon: "◇", label: "90-Day Reset" },
  { id: "planner", icon: "⚡", label: "Planner & Habits" },
  { id: "revision", icon: "◫", label: "Revision Arena" },
  { id: "alarm", icon: "◉", label: "Smart Alarm" },
  { id: "reminders", icon: "🔔", label: "Reminders" },
  { id: "gym", icon: "◆", label: "Gym Planner" },
  { id: "expenses", icon: "₹", label: "Expenses" },
  { id: "rewards", icon: "◈", label: "Coin Store" },
  { id: "change", icon: "↻", label: "Build / Break" },
  { id: "history", icon: "▦", label: "Day History" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

const formatMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const nextId = () => Date.now();

const STORE_ITEMS: StoreItem[] = [
  { id: "theme-cyber", name: "Neon Strike", icon: "◈", kind: "theme", cost: 0, rarity: "COMMON", description: "Electric cyan command-center skin.", theme: "cyber" },
  { id: "theme-royal", name: "Royal Phantom", icon: "♛", kind: "theme", cost: 650, rarity: "EPIC", description: "Purple energy panels and elite glow.", theme: "royal" },
  { id: "theme-stealth", name: "Crimson Ops", icon: "⌁", kind: "theme", cost: 900, rarity: "LEGENDARY", description: "Red tactical HUD for focused missions.", theme: "stealth" },
  { id: "sticker-focus", name: "Focus Fire", icon: "🎯", kind: "sticker", cost: 0, rarity: "COMMON", description: "A sharp focus sticker for your player card." },
  { id: "sticker-flame", name: "Streak Flame", icon: "🔥", kind: "sticker", cost: 180, rarity: "RARE", description: "Show everyone that your combo is alive." },
  { id: "sticker-brain", name: "Digital Brain", icon: "🧠", kind: "sticker", cost: 260, rarity: "EPIC", description: "Quest AI-inspired profile sticker." },
  { id: "badge-discipline", name: "Discipline Elite", icon: "🛡️", kind: "badge", cost: 420, rarity: "EPIC", description: "An elite badge beside your player identity." },
  { id: "badge-scholar", name: "Revision Master", icon: "🏆", kind: "badge", cost: 550, rarity: "LEGENDARY", description: "A trophy badge for academic grinders." },
  { id: "effect-sparks", name: "XP Sparks", icon: "✨", kind: "effect", cost: 320, rarity: "RARE", description: "Adds a charged sparkle aura to your avatar." },
  { id: "effect-pulse", name: "Legend Pulse", icon: "⚡", kind: "effect", cost: 780, rarity: "LEGENDARY", description: "Animated power pulse around your player card." },
];

const DAILY_QUOTES = [
  { quote: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { quote: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { quote: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { quote: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { quote: "It always seems impossible until it is done.", author: "Nelson Mandela" },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "A little progress each day adds up to big results.", author: "Satya Nani" },
  { quote: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { quote: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { quote: "The pain you feel today will be the strength you feel tomorrow.", author: "Arnold Schwarzenegger" },
];

function dailyQuote(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return DAILY_QUOTES[Math.abs(day) % DAILY_QUOTES.length];
}

function getRecommendations(state: LifeQuestState, currentDayCode: string, today: string): Recommendation[] {
  const incomplete = state.tasks.filter((task) => !task.done);
  const urgent = incomplete.find((task) => task.priority === "High") || incomplete[0];
  const dueRevision = state.revisions.find((item) => {
    if (item.done) return false;
    const due = today ? revisionDate(item, today) : undefined;
    return due ? due <= today : item.nextReview === "Today";
  });
  const spend = state.expenses.items.reduce((sum, item) => sum + item.amount, 0);
  const budgetPercent = state.expenses.budget ? Math.round((spend / state.expenses.budget) * 100) : 0;
  const workout = state.workouts.find((day) => day.day === currentDayCode && !day.complete);
  const habit = state.habits.find((item) => !item.done);
  const picks: Recommendation[] = [];

  if (urgent) picks.push({ code: "PRIORITY TARGET", title: urgent.title, detail: `Start at ${urgent.start === "--:--" ? "your next free slot" : urgent.start}. One ${urgent.duration}-minute push earns ${urgent.xp} XP.`, action: "OPEN MISSION", tab: "planner", tone: "cyan" });
  if (dueRevision) picks.push({ code: "MEMORY ALERT", title: "Fight the forgetting curve", detail: `${dueRevision.title} is due today at ${dueRevision.mastery}% mastery. A short quiz is your best next move.`, action: "ENTER ARENA", tab: "revision", tone: "purple" });
  if (budgetPercent >= 75) picks.push({ code: "BUDGET SHIELD", title: "Switch to defence mode", detail: `${budgetPercent}% of this month's budget is used. Delay non-essential spending until the next checkpoint.`, action: "VIEW LEDGER", tab: "expenses", tone: "amber" });
  else if (workout) picks.push({ code: "BODY QUEST", title: `${workout.day}: ${workout.muscles}`, detail: `${workout.exercises.length} exercises are waiting. Clear the workout to collect 150 XP and 50 coins.`, action: "EQUIP WORKOUT", tab: "gym", tone: "lime" });
  if (habit) picks.push({ code: "COMBO SAVE", title: `Protect: ${habit.name}`, detail: `Your ${habit.streak}-day combo is still open. Complete it before the day ends for ${habit.reward} coins.`, action: "CHECK HABITS", tab: "planner", tone: "amber" });
  return picks.slice(0, 3);
}

export default function Home() {
  const [active, setActive] = useState<Tab>("overview");
  const [state, setState] = useState<LifeQuestState>(() => createInitialState());
  const [account, setAccount] = useState<AppAccount | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "saved" | "saving" | "offline">("loading");
  const loadedAccountId = useRef<string | null>(null);
  const alarmAudioContext = useRef<AudioContext | null>(null);
  const alarmPulseTimer = useRef<number | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState<Alarm | null>(null);
  const [alarmPermission, setAlarmPermission] = useState<AlarmPermission>(() => typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(() => (
    typeof window === "undefined" ? null : (window as InstallWindow).lifeQuestInstallPrompt || null
  ));
  const [installGuide, setInstallGuide] = useState<InstallPlatform | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  ));
  const [toast, setToast] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    { role: "ai", text: "Commander online. I analyse your missions, habits, revision, fitness and budget to recommend the smartest next move." },
  ]);
  const today = clock ? localDateKey(clock) : "";
  const currentDayCode = clock ? clock.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase() : "MON";
  const currentDateTime = clock
    ? clock.toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()
    : "SYNCING DATE & TIME";

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const stopAlarmSound = useCallback(() => {
    if (alarmPulseTimer.current !== null) {
      window.clearInterval(alarmPulseTimer.current);
      alarmPulseTimer.current = null;
    }
  }, []);

  const prepareAlarmAlerts = useCallback(async () => {
    let permission: AlarmPermission = "unsupported";
    if ("Notification" in window) {
      permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
    }
    setAlarmPermission(permission);

    const AudioContextConstructor = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextConstructor) {
      const context = alarmAudioContext.current || new AudioContextConstructor();
      alarmAudioContext.current = context;
      if (context.state === "suspended") await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.00001;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.02);
    }
    return permission;
  }, []);

  const startAlarmSound = useCallback(() => {
    stopAlarmSound();
    const AudioContextConstructor = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = alarmAudioContext.current || new AudioContextConstructor();
    alarmAudioContext.current = context;

    const pulse = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.32, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.44);
    };

    void context.resume().then(pulse).catch(() => undefined);
    alarmPulseTimer.current = window.setInterval(pulse, 760);
  }, [stopAlarmSound]);

  const triggerAlarm = useCallback((alarm: Alarm, forceSound = false) => {
    setRingingAlarm(alarm);
    if (forceSound || state.settings.sound) startAlarmSound();
    if ("Notification" in window && Notification.permission === "granted") {
      const options: NotificationOptions = {
        body: `${alarm.time} · Mission: ${alarm.mission}`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `lifequest-alarm-${alarm.id}`,
        requireInteraction: true,
      };
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.ready
          .then((registration) => registration.showNotification(alarm.label || "LifeQuest alarm", options))
          .catch(() => new Notification(alarm.label || "LifeQuest alarm", options));
      } else {
        new Notification(alarm.label || "LifeQuest alarm", options);
      }
    }
  }, [startAlarmSound, state.settings.sound]);

  const triggerReminder = useCallback((reminder: Reminder) => {
    notify(`Reminder: ${reminder.title}`);
    if ("Notification" in window && Notification.permission === "granted") {
      const options: NotificationOptions = {
        body: reminder.repeat === "daily" ? `Daily reminder · ${reminder.time}` : `${reminder.date} · ${reminder.time}`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `lifequest-reminder-${reminder.id}`,
        requireInteraction: true,
        data: { url: "/" },
      };
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.ready
          .then((registration) => registration.showNotification(reminder.title, options))
          .catch(() => new Notification(reminder.title, options));
      } else {
        new Notification(reminder.title, options);
      }
    }
  }, [notify]);

  useEffect(() => {
    const updateClock = () => {
      const next = new Date();
      setClock(next);
      setState((current) => syncStateToDate(current, localDateKey(next)));
    };
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const capturePreparedInstall = () => {
      setInstallPrompt((window as InstallWindow).lifeQuestInstallPrompt || null);
    };
    const markInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallGuide(null);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("lifequest-install-ready", capturePreparedInstall);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("lifequest-install-ready", capturePreparedInstall);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    return stopAlarmSound;
  }, [stopAlarmSound]);

  useEffect(() => {
    fetch("/api/auth/session").then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        const restoredAccount = payload.user as AppAccount;
        const startedOn = restoredAccount.createdAt ? localDateKey(new Date(restoredAccount.createdAt)) : localDateKey(new Date());
        loadedAccountId.current = null;
        setState(createInitialState(restoredAccount.name, startedOn));
        setHydrated(false);
        setAccount(restoredAccount);
      })
      .catch(() => {
        loadedAccountId.current = null;
        setState(createInitialState());
        setAccount(null);
      })
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    loadedAccountId.current = null;

    if (!account) {
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        setHydrated(true);
        setSyncStatus("offline");
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const todayKey = localDateKey(new Date());
    const startedOn = account.createdAt ? localDateKey(new Date(account.createdAt)) : todayKey;
    const freshState = createInitialState(account.name, startedOn);
    fetch("/api/state")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        if (cancelled) return;
        const savedState = payload.state as LifeQuestState | null;
        const hasPersonalState = Boolean(savedState && !isLegacyDemoState(savedState, account));
        const nextState = hasPersonalState
          ? syncStateToDate({ ...savedState!, reminders: savedState!.reminders || [] }, todayKey, startedOn)
          : freshState;
        loadedAccountId.current = account.id;
        setState(nextState);
        setSyncStatus(hasPersonalState ? "saved" : "saving");
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        loadedAccountId.current = null;
        setSyncStatus("offline");
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [account, sessionLoading]);

  useEffect(() => {
    if (!hydrated || !account || loadedAccountId.current !== account.id) return;
    setSyncStatus("saving");
    const timer = window.setTimeout(() => {
      fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state }) })
        .then((response) => { if (!response.ok) throw new Error(); setSyncStatus("saved"); })
        .catch(() => setSyncStatus("offline"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [state, hydrated, account]);

  useEffect(() => {
    if (!hydrated || !account) return;
    const checkAlarms = () => {
      const now = new Date();
      const due = state.alarms.find((alarm) => isAlarmDue(alarm, now));
      if (!due) return;
      const alarmKey = `${localDateKey(now)}:${due.id}:${due.time}`;
      const storageKey = `lifequest-last-alarm-${account.id}`;
      if (window.localStorage.getItem(storageKey) === alarmKey) return;
      window.localStorage.setItem(storageKey, alarmKey);
      triggerAlarm(due);
    };
    checkAlarms();
    const timer = window.setInterval(checkAlarms, 1_000);
    return () => window.clearInterval(timer);
  }, [account, hydrated, state.alarms, triggerAlarm]);

  useEffect(() => {
    if (!hydrated || !account) return;
    const checkReminders = () => {
      const now = new Date();
      const due = (state.reminders || []).find((reminder) => isReminderDue(reminder, now));
      if (!due) return;
      const reminderKey = `${localDateKey(now)}:${due.id}:${due.time}`;
      const storageKey = `lifequest-last-reminder-${account.id}`;
      if (window.localStorage.getItem(storageKey) === reminderKey) return;
      window.localStorage.setItem(storageKey, reminderKey);
      triggerReminder(due);
      if (due.repeat === "once") {
        setState((current) => ({ ...current, reminders: (current.reminders || []).map((item) => item.id === due.id ? { ...item, enabled: false } : item) }));
      }
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 15_000);
    return () => window.clearInterval(timer);
  }, [account, hydrated, state.reminders, triggerReminder]);

  const dismissAlarm = useCallback(() => {
    stopAlarmSound();
    setRingingAlarm(null);
    notify("Wake mission cleared! Alarm dismissed");
  }, [notify, stopAlarmSound]);

  const testAlarm = useCallback(async (alarm?: Alarm) => {
    await prepareAlarmAlerts();
    triggerAlarm(alarm || { id: -1, time: new Date().toTimeString().slice(0, 5), label: "Alarm sound test", mission: "Math challenge", enabled: true }, true);
  }, [prepareAlarmAlerts, triggerAlarm]);

  const installApp = useCallback(async () => {
    if (isInstalled) {
      notify("LifeQuest is already installed on this device");
      return;
    }
    if (!installPrompt) {
      setInstallGuide(detectInstallPlatform());
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        notify("LifeQuest app installed");
      } else {
        notify("Installation cancelled");
      }
      delete (window as InstallWindow).lifeQuestInstallPrompt;
      setInstallPrompt(null);
    } catch {
      delete (window as InstallWindow).lifeQuestInstallPrompt;
      setInstallPrompt(null);
      setInstallGuide(detectInstallPlatform());
    }
  }, [installPrompt, isInstalled, notify]);

  const award = (xp: number, coins: number, message: string) => {
    const rewardedCoins = Math.round(coins * (state.settings?.coinMultiplier || 1));
    setState((current) => ({ ...current, profile: { ...current.profile, xp: current.profile.xp + xp, coins: current.profile.coins + rewardedCoins } }));
    notify(`${message}  +${xp} XP  +${rewardedCoins} coins`);
  };

  const currentMonthKey = today.slice(0, 7);
  const expenseTotal = useMemo(() => state.expenses.items
    .filter((item) => !currentMonthKey || item.date.startsWith(currentMonthKey))
    .reduce((sum, item) => sum + item.amount, 0), [state.expenses.items, currentMonthKey]);
  const completedTasks = state.tasks.filter((task) => task.done).length;
  const recommendations = useMemo(() => getRecommendations(state, currentDayCode, today), [state, currentDayCode, today]);
  const equippedSticker = STORE_ITEMS.find((item) => item.id === state.store?.equipped.sticker);
  const equippedBadge = STORE_ITEMS.find((item) => item.id === state.store?.equipped.badge);
  const equippedEffect = state.store?.equipped.effect;

  const askAssistant = async (suggestion?: string) => {
    const message = (suggestion || assistantPrompt).trim();
    if (!message || assistantThinking) return;
    const prior = assistantMessages;
    setAssistantMessages((current) => [...current, { role: "user", text: message }]);
    setAssistantPrompt("");
    setAssistantThinking(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, active, state, messages: prior.map((item) => ({ role: item.role === "ai" ? "assistant" : "user", content: item.text })) }) });
      const payload = await response.json() as { answer?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "ASSISTANT_FAILED");
      if (!payload.answer) throw new Error();
      setAssistantMessages((current) => [...current, { role: "ai", text: payload.answer! }]);
    } catch (error) {
      const status = error instanceof Error ? error.message : "ASSISTANT_FAILED";
      const text = status === "AI_NOT_CONFIGURED"
        ? "Quest AI is not configured yet. Add OPENAI_API_KEY to the private server environment, then restart or redeploy the app."
        : "Quest AI could not reach its digital brain right now. Please try again in a moment.";
      setAssistantMessages((current) => [...current, { role: "ai", text }]);
    } finally {
      setAssistantThinking(false);
    }
  };

  const toggleTask = (id: number) => {
    const target = state.tasks.find((task) => task.id === id);
    if (!target) return;
    const direction = target.done ? -1 : 1;
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task),
      profile: {
        ...current.profile,
        xp: Math.max(0, current.profile.xp + (direction * target.xp)),
        coins: Math.max(0, current.profile.coins + (direction * Math.round((target.xp / 5) * (current.settings?.coinMultiplier || 1)))),
        focusMinutes: Math.max(0, current.profile.focusMinutes + (direction * target.duration)),
      },
    }));
    if (!target.done) notify(`Mission complete! +${target.xp} XP`);
  };

  const toggleHabit = (id: number) => {
    const target = state.habits.find((habit) => habit.id === id);
    if (!target) return;
    const direction = target.done ? -1 : 1;
    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) => habit.id === id ? { ...habit, done: !habit.done, streak: habit.done ? Math.max(0, habit.streak - 1) : habit.streak + 1 } : habit),
      profile: {
        ...current.profile,
        coins: Math.max(0, current.profile.coins + (direction * Math.round(target.reward * (current.settings?.coinMultiplier || 1)))),
        xp: Math.max(0, current.profile.xp + (direction * 30)),
      },
    }));
    if (!target.done) notify(`Habit combo extended! +${target.reward} coins`);
  };

  return (
    <main className={`app-shell theme-${state.settings?.theme || "cyber"} ${state.settings?.compact ? "compact-mode" : ""}`}>
      <div className="world-fog fog-one"/><div className="world-fog fog-two"/><div className="hud-scanlines"/>
      {toast && <div className="toast"><span>◆</span>{toast}</div>}
      {!account && <LoginGate onLogin={(next) => {
        const startedOn = next.createdAt ? localDateKey(new Date(next.createdAt)) : localDateKey(new Date());
        loadedAccountId.current = null;
        setState(createInitialState(next.name, startedOn));
        setHydrated(false);
        setAccount(next);
        notify(`Welcome, ${next.name}`);
      }} />}
      <aside className="sidebar">
        <button className="brand" onClick={() => setActive("overview")}><span className="brand-mark">LQ</span><span>LIFEQUEST<small>90</small></span></button>
        <nav className="nav-list" aria-label="Main navigation">
          {NAV.map((item) => <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "nav-item active" : "nav-item"}><span className="nav-icon">{item.icon}</span><span className="nav-label">{item.label}</span></button>)}
        </nav>
        <div className={`player-card ${equippedEffect ? "cosmetic-effect" : ""}`}>
          <div className="avatar">{playerInitials(state.profile.name)}</div>
          <div><strong>{equippedSticker?.icon} {state.profile.name} {equippedBadge?.icon}</strong><span>LEVEL {playerLevel(state.profile.xp)} · {playerRank(state.profile.xp)}</span></div>
          <b>›</b>
        </div>
      </aside>

      <section className="main-stage">
        <header className="topbar">
          <div><span className={`online-dot ${syncStatus === "offline" ? "offline" : ""}`} /> {syncStatus === "saving" ? "SAVING PROGRESS" : syncStatus === "offline" ? "LOCAL MODE" : "SYSTEM ONLINE"} <b>· {currentDateTime}</b></div>
          <div className="resource-bar"><button className="ai-online-button" onClick={() => setAssistantOpen(true)}><i/> QUEST AI</button><span>🔥 <b>{state.profile.streak}</b> day streak</span><span>◈ <b>{state.profile.coins.toLocaleString("en-IN")}</b> coins</span><button aria-label="Enable alarm notifications" onClick={async () => { const result = await prepareAlarmAlerts(); notify(result === "granted" ? "Alarm sound and notifications enabled" : "Alarm sound prepared; notifications remain disabled"); }}>♢</button></div>
        </header>

        <div className="dashboard">
          {active === "overview" && <Overview state={state} expenseTotal={expenseTotal} completedTasks={completedTasks} recommendations={recommendations} toggleTask={toggleTask} toggleHabit={toggleHabit} go={setActive} openAssistant={() => setAssistantOpen(true)} currentDayCode={currentDayCode} clock={clock} />}
          {active === "reset" && <ResetModule state={state} setState={setState} award={award} today={today} />}
          {active === "planner" && <PlannerModule state={state} setState={setState} toggleTask={toggleTask} toggleHabit={toggleHabit} notify={notify} />}
          {active === "revision" && <RevisionModule state={state} setState={setState} award={award} today={today} />}
          {active === "alarm" && <AlarmModule state={state} setState={setState} notify={notify} permission={alarmPermission} prepareAlerts={prepareAlarmAlerts} testAlarm={testAlarm} />}
          {active === "reminders" && <ReminderModule state={state} setState={setState} notify={notify} permission={alarmPermission} prepareAlerts={prepareAlarmAlerts} today={today} />}
          {active === "gym" && <GymModule state={state} setState={setState} award={award} currentDayCode={currentDayCode} />}
          {active === "expenses" && <ExpenseModule state={state} setState={setState} total={expenseTotal} notify={notify} today={today} />}
          {active === "rewards" && <RewardModule state={state} setState={setState} notify={notify} today={today} />}
          {active === "change" && <ChangeModule state={state} setState={setState} notify={notify} />}
          {active === "history" && <HistoryModule state={state} today={today} />}
          {active === "settings" && <SettingsModule state={state} setState={setState} account={account} logout={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            stopAlarmSound();
            setRingingAlarm(null);
            loadedAccountId.current = null;
            setHydrated(false);
            setAccount(null);
            setState(createInitialState());
            setActive("overview");
          }} notify={notify} today={today} isInstalled={isInstalled} canInstall={Boolean(installPrompt)} installApp={installApp} />}
        </div>
      </section>
      <button className={`ai-companion ${assistantOpen ? "active" : ""}`} onClick={() => setAssistantOpen((open) => !open)} aria-label="Open Quest AI assistant"><span className="ai-core">AI</span><i/><b>ASK QUEST AI</b></button>
      <aside className={`assistant-drawer ${assistantOpen ? "open" : ""}`} aria-hidden={!assistantOpen}>
        <header className="assistant-header"><div className="assistant-reactor"><span>AI</span></div><div><span className="eyebrow">DIGITAL BRAIN // AGENT MODE</span><h2>Quest AI</h2><p>Ask anything · understands your LifeQuest context</p></div><button onClick={() => setAssistantOpen(false)} aria-label="Close assistant">×</button></header>
        <div className="assistant-radar"><div><span>READINESS</span><b>{Math.round(((completedTasks / Math.max(1, state.tasks.length)) * 60) + ((state.habits.filter((habit) => habit.done).length / Math.max(1, state.habits.length)) * 40))}%</b></div><div><span>TOP SIGNAL</span><b>{recommendations[0]?.code || "SYSTEM STABLE"}</b></div></div>
        <div className="assistant-chat" aria-live="polite">{assistantMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}><span>{message.role === "ai" ? "QUEST AI" : "YOU"}</span><p>{message.text}</p></div>)}{assistantThinking && <div className="chat-bubble thinking"><span>QUEST AI</span><p>Analysing your query and LifeQuest data<span className="thinking-dots">•••</span></p></div>}</div>
        <div className="prompt-chips"><button onClick={() => void askAssistant("What should I do next today?")}>NEXT MOVE</button><button onClick={() => void askAssistant("Explain neural networks simply")}>ASK ANYTHING</button><button onClick={() => void askAssistant("Create a personalized study plan from my current progress")}>SMART PLAN</button></div>
        <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); void askAssistant(); }}><input value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} placeholder="Ask anything in Hindi, Hinglish or English..." aria-label="Message Quest AI" disabled={assistantThinking}/><button type="submit" disabled={assistantThinking}>{assistantThinking ? "THINKING" : "SEND"}</button></form>
        <small className="assistant-note">Real AI + private app context. App-changing actions always require confirmation.</small>
      </aside>
      {installGuide && <InstallAppGuide platform={installGuide} close={() => setInstallGuide(null)} />}
      {ringingAlarm && <AlarmMission key={`${ringingAlarm.id}-${ringingAlarm.time}`} alarm={ringingAlarm} dismiss={dismissAlarm} notify={notify} />}
    </main>
  );
}

function LoginGate({ onLogin }: { onLogin: (account: AppAccount) => void }) {
  const [mode, setMode] = useState<"choose" | "mobile" | "otp" | "google">("choose");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [pendingMethod, setPendingMethod] = useState<"mobile" | "google">("mobile");
  const [status, setStatus] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [requestingOtp, setRequestingOtp] = useState(false);

  useEffect(() => {
    if (mode !== "otp" || resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [mode, resendIn]);

  const requestOtp = async (method: "mobile" | "google") => {
    if (requestingOtp || (mode === "otp" && resendIn > 0)) return;
    setRequestingOtp(true);
    setStatus("Sending secure OTP…");
    const destination = method === "mobile" ? `+91${mobile}` : email;
    try {
      const response = await fetch("/api/auth/request-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel: method === "mobile" ? "sms" : "email", destination }) });
      const payload = await response.json() as { challengeId?: string; error?: string };
      if (!response.ok || !payload.challengeId) {
        setStatus(payload.error === "OTP_RATE_LIMIT" ? "Please wait 15 seconds before requesting another OTP." : payload.error || "Could not send OTP");
        return;
      }
      setChallengeId(payload.challengeId);
      setPendingMethod(method);
      setOtp("");
      setResendIn(15);
      setStatus(`OTP sent to ${destination}`);
      setMode("otp");
    } catch {
      setStatus("Could not connect. Check your internet and try again.");
    } finally {
      setRequestingOtp(false);
    }
  };
  const verifyOtp = async () => {
    setStatus("Verifying…");
    const response = await fetch("/api/auth/verify-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId, code: otp, name }) });
    const payload = await response.json() as { user?: AppAccount; error?: string };
    if (!response.ok || !payload.user) { setStatus(payload.error || "Verification failed"); return; }
    onLogin(payload.user);
  };
  return <div className="login-gate"><section className="login-card game-panel"><div className="login-emblem">LQ<span>90</span></div><span className="eyebrow">PLAYER AUTHENTICATION</span><h1>ENTER LIFEQUEST</h1><p>Your missions, progress, rewards and settings stay linked to your player profile.</p>
    {mode === "choose" && <div className="login-actions"><button className="google-login" onClick={() => setMode("google")}><b>G</b> Login with Gmail OTP</button><button className="mobile-login" onClick={() => setMode("mobile")}><b>▣</b> Login using mobile OTP</button></div>}
    {mode === "mobile" && <div className="login-form"><label>PLAYER NAME<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"/></label><label>MOBILE NUMBER<div className="phone-input"><span>+91</span><input inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} placeholder="10-digit number"/></div></label><small>{status || "A one-time code will be sent securely by SMS."}</small><button className="glow-btn full" disabled={mobile.length !== 10 || requestingOtp} onClick={() => void requestOtp("mobile")}>{requestingOtp ? "SENDING…" : "SEND OTP"}</button><button className="text-button" onClick={() => setMode("choose")}>← Back</button></div>}
    {mode === "otp" && <div className="login-form"><label>ENTER OTP<input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit OTP"/></label><small>{status}</small><button className="glow-btn full" disabled={otp.length !== 6} onClick={() => void verifyOtp()}>VERIFY & START</button><button className="resend-otp" disabled={resendIn > 0 || requestingOtp} onClick={() => void requestOtp(pendingMethod)}>{requestingOtp ? "SENDING…" : resendIn > 0 ? `RESEND ${pendingMethod === "google" ? "GMAIL" : "MOBILE"} OTP IN ${resendIn}s` : `RESEND ${pendingMethod === "google" ? "GMAIL" : "MOBILE"} OTP`}</button><button className="text-button" onClick={() => setMode(pendingMethod === "mobile" ? "mobile" : "google")}>← Change destination</button></div>}
    {mode === "google" && <div className="login-form"><label>PLAYER NAME<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"/></label><label>GMAIL ADDRESS<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com"/></label><small>{status || "A one-time code will be sent securely through Gmail."}</small><button className="google-login" disabled={!email.includes("@") || requestingOtp} onClick={() => void requestOtp("google")}><b>G</b> {requestingOtp ? "SENDING…" : "SEND GMAIL OTP"}</button><button className="text-button" onClick={() => setMode("choose")}>← Back</button></div>}
  </section></div>;
}

function HistoryModule({ state, today }: { state: LifeQuestState; today: string }) {
  const activeDate = today || state.profile.lastActiveDate || "";
  const todayLog: DayLog = { date: activeDate, tasks: state.tasks.map((item) => ({ title: item.title, done: item.done })), habits: state.habits.map((item) => ({ title: item.name, done: item.done })) };
  const logs = [...(state.history || []).filter((item) => item.date !== activeDate), ...(activeDate ? [todayLog] : [])].sort((a, b) => b.date.localeCompare(a.date));
  const [selected, setSelected] = useState("");
  const selectedDate = selected && logs.some((item) => item.date === selected) ? selected : activeDate;
  const activeLog = logs.find((item) => item.date === selectedDate) || logs[0];
  const all = [...(activeLog?.tasks || []), ...(activeLog?.habits || [])];
  const complete = all.filter((item) => item.done).length;
  return <><ModuleHeader code="MISSION ARCHIVE // DAILY REVIEW" title="See every day clearly." text="Select a date to check exactly which tasks and habits were completed and which were missed." stat={`${complete} / ${all.length} DONE`} />
    <section className="history-layout"><article className="game-panel history-calendar"><div className="panel-heading"><div><span className="eyebrow">RECENT DAYS</span><h2>Activity timeline</h2></div></div><div className="day-grid">{logs.map((log) => { const entries = [...log.tasks, ...log.habits]; const score = entries.filter((x) => x.done).length; return <button key={log.date} className={selectedDate === log.date ? "active" : ""} onClick={() => setSelected(log.date)}><time>{new Date(`${log.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</time><b>{score}/{entries.length}</b><i style={{ width: `${entries.length ? score / entries.length * 100 : 0}%` }}/><span>{score === entries.length ? "ALL CLEAR" : `${entries.length - score} MISSED`}</span></button>; })}</div></article>
      <article className="game-panel history-detail"><div className="panel-heading"><div><span className="eyebrow">{selectedDate === activeDate ? "TODAY'S STATUS" : "DAY REPORT"}</span><h2>{selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) : "Syncing date…"}</h2></div><span className="count-chip">{Math.round((complete / Math.max(1, all.length)) * 100)}% SCORE</span></div><h3>MISSIONS</h3>{activeLog?.tasks.map((item) => <div className={`history-row ${item.done ? "done" : "missed"}`} key={item.title}><span>{item.done ? "✓" : "×"}</span><strong>{item.title}</strong><em>{item.done ? "COMPLETED" : "MISSED"}</em></div>)}<h3>HABITS</h3>{activeLog?.habits.map((item) => <div className={`history-row ${item.done ? "done" : "missed"}`} key={item.title}><span>{item.done ? "✓" : "×"}</span><strong>{item.title}</strong><em>{item.done ? "COMPLETED" : "MISSED"}</em></div>)}</article></section>
  </>;
}

function InstallAppGuide({ platform, close }: { platform: InstallPlatform; close: () => void }) {
  const instructions: Record<InstallPlatform, { title: string; intro: string; steps: string[] }> = {
    ios: {
      title: "Install on iPhone or iPad",
      intro: "Apple requires this action from Safari; a website cannot open the iOS install menu automatically.",
      steps: ["Open LifeQuest in Safari.", "Tap the Share icon at the bottom of Safari.", "Choose Add to Home Screen.", "Tap Add to finish."],
    },
    android: {
      title: "Install on Android",
      intro: "If Chrome does not show its automatic install prompt, use the browser menu.",
      steps: ["Open LifeQuest in Chrome.", "Tap the three-dot menu.", "Choose Install app or Add to Home screen.", "Confirm Install."],
    },
    desktop: {
      title: "Install on this computer",
      intro: "Chrome and Edge can install LifeQuest as a standalone desktop app.",
      steps: ["Open LifeQuest in Chrome or Edge.", "Click the install icon in the address bar, or open the browser menu.", "Choose Install LifeQuest.", "Confirm Install."],
    },
    other: {
      title: "Add LifeQuest to your device",
      intro: "Installation controls depend on your browser.",
      steps: ["Open the browser menu.", "Choose Install app or Add to Home screen.", "Confirm the installation.", "If the option is missing, reopen this page in Chrome, Edge or Safari."],
    },
  };
  const guide = instructions[platform];
  return <div className="install-guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
    <section className="install-guide game-panel">
      <button className="install-guide-close" onClick={close} aria-label="Close installation guide">×</button>
      <span className="eyebrow">LIFEQUEST APP INSTALLATION</span>
      <h2 id="install-guide-title">{guide.title}</h2>
      <p>{guide.intro}</p>
      <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <button className="glow-btn full" onClick={platform === "ios" ? close : () => window.location.reload()}>
        {platform === "ios" ? "GOT IT — OPEN SAFARI MENU" : "REFRESH & CHECK NATIVE INSTALL"}
      </button>
      <small>This installs the secure LifeQuest PWA from the deployed website; it does not download a separate APK.</small>
    </section>
  </div>;
}

function SettingsModule({ state, setState, account, logout, notify, today, isInstalled, canInstall, installApp }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; account: AppAccount | null; logout: () => void; notify: (message: string) => void; today: string; isInstalled: boolean; canInstall: boolean; installApp: () => Promise<void> }) {
  const settings = state.settings || DEFAULT_STATE.settings;
  const resetToday = () => { if (!window.confirm("Reset all task and habit checkmarks for today?")) return; setState((s) => ({ ...s, tasks: s.tasks.map((x) => ({ ...x, done: false })), habits: s.habits.map((x) => ({ ...x, done: false })), revisions: s.revisions.map((x) => ({ ...x, done: false })), changeHabits: s.changeHabits.map((x) => ({ ...x, done: false })) })); notify("Today's mission status reset"); };
  const resetJourney = () => { if (!window.confirm("Restart the 90-day journey from Day 1? Your custom tasks and expenses will stay.")) return; setState((s) => ({ ...s, profile: { ...s.profile, day: 1, xp: 0, coins: 0, streak: 0, journeyStartedOn: today || s.profile.journeyStartedOn, lastActiveDate: today || s.profile.lastActiveDate } })); notify("90-day campaign restarted"); };
  const factoryReset = () => { if (!window.confirm("Factory reset everything? This permanently clears this profile's custom data.")) return; setState(createInitialState(state.profile.name, today || localDateKey(new Date()))); notify("App returned to default settings"); };
  const deleteAccount = async () => { if (!window.confirm("Permanently delete your account and all LifeQuest progress? This cannot be undone.")) return; const confirmation = window.prompt('Type DELETE to confirm'); if (confirmation !== "DELETE") return; const response = await fetch("/api/auth/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation }) }); if (!response.ok) { notify("Account could not be deleted"); return; } await logout(); };
  const update = (patch: Partial<LifeQuestState["settings"]>) => setState((s) => ({ ...s, settings: { ...(s.settings || DEFAULT_STATE.settings), ...patch } }));
  return <><ModuleHeader code="CONTROL ROOM // PERSONALIZE" title="Make LifeQuest yours." text="Customize the game experience, daily targets, rewards and reset only the data you choose." stat="PLAYER SETTINGS" />
    <section className="settings-grid"><article className="game-panel setting-card"><span className="eyebrow">PLAYER PROFILE</span><h2>{state.profile.name}</h2><p>{account?.method === "google" ? "Gmail OTP profile" : "Mobile OTP profile"} · {account?.label}</p><p>90-day journey started: {state.profile.journeyStartedOn ? dateFromKey(state.profile.journeyStartedOn).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Syncing…"}</p><label>Display name<input value={state.profile.name} onChange={(e) => setState((s) => ({ ...s, profile: { ...s.profile, name: e.target.value } }))}/></label><button className="secondary-btn" onClick={logout}>LOG OUT</button></article>
      <article className="game-panel setting-card"><span className="eyebrow">GAME EXPERIENCE</span><h2>Interface loadout</h2><label>Theme<select value={settings.theme} onChange={(e) => update({ theme: e.target.value as LifeQuestState["settings"]["theme"] })}><option value="cyber">Cyber Cyan</option><option value="royal">Royal Purple</option><option value="stealth">Stealth Red</option></select></label><div className="setting-toggle"><span><strong>Compact dashboard</strong><small>Fit more missions on screen</small></span><button className={`toggle ${settings.compact ? "on" : ""}`} onClick={() => update({ compact: !settings.compact })}><i/></button></div><div className="setting-toggle"><span><strong>Alarm sound</strong><small>Play the repeating wake-up tone</small></span><button className={`toggle ${settings.sound ? "on" : ""}`} onClick={() => update({ sound: !settings.sound })}><i/></button></div></article>
      <article className="game-panel setting-card"><span className="eyebrow">GAME RULES</span><h2>Your difficulty</h2><label>Daily priority mission goal<input type="number" min="1" max="12" value={settings.dailyGoal} onChange={(e) => update({ dailyGoal: Number(e.target.value) })}/></label><label>Coin reward multiplier<select value={settings.coinMultiplier} onChange={(e) => update({ coinMultiplier: Number(e.target.value) })}><option value={0.5}>0.5× Hard</option><option value={1}>1× Balanced</option><option value={1.5}>1.5× Boosted</option></select></label><p className="info-chip">You can also customize habits, missions, rewards, alarms and gym days inside their own modules.</p></article>
      <article className="game-panel setting-card"><span className="eyebrow">MOBILE & DESKTOP APP</span><h2>{isInstalled ? "LifeQuest is installed" : "Install LifeQuest"}</h2><p>Open it from your Android, iPhone, Windows or Mac home screen like an app. Your secure session stays signed in for up to 90 days.</p><button className="glow-btn full" disabled={isInstalled} onClick={() => void installApp()}>{isInstalled ? "✓ APP INSTALLED" : canInstall ? "INSTALL LIFEQUEST NOW" : "SHOW INSTALL STEPS"}</button><p className="info-chip">On iPhone: Safari → Share → Add to Home Screen. On Android/desktop: the native install prompt opens when available.</p></article>
      <article className="game-panel setting-card danger-zone"><span className="eyebrow">RESET ZONE</span><h2>Reset controls</h2><button onClick={resetToday}>RESET TODAY&apos;S CHECKMARKS <small>Keep all tasks, clear completion only</small></button><button onClick={resetJourney}>RESTART 90-DAY JOURNEY <small>Keep personal plans and expenses</small></button><button className="danger" onClick={factoryReset}>FACTORY RESET APP <small>Clear all customized profile data</small></button><button className="danger" onClick={() => void deleteAccount()}>DELETE ACCOUNT <small>Permanently erase profile, progress and sessions</small></button></article></section>
  </>;
}

function Overview({ state, expenseTotal, completedTasks, recommendations, toggleTask, toggleHabit, go, openAssistant, currentDayCode, clock }: { state: LifeQuestState; expenseTotal: number; completedTasks: number; recommendations: Recommendation[]; toggleTask: (id: number) => void; toggleHabit: (id: number) => void; go: (tab: Tab) => void; openAssistant: () => void; currentDayCode: string; clock: Date | null }) {
  const modules: [string, string, string, string, Tab][] = [
    ["90D", "Life Reset", `Day ${state.profile.day} · Phase ${state.profile.day <= 22 ? "I" : state.profile.day <= 66 ? "II" : "III"}`, "#8b5cf6", "reset"],
    ["AI", "Smart Planner", `${state.tasks.length} missions today`, "#31d7ff", "planner"],
    ["GYM", "Gym Planner", `${state.workouts.find((day) => day.day === currentDayCode)?.muscles || "Today's workout"}`, "#caff4a", "gym"],
    ["₹", "Expenses", `${formatMoney(Math.max(0, state.expenses.budget - expenseTotal))} left`, "#ffb84d", "expenses"],
  ];
  const xpLevel = Math.floor(state.profile.xp / 1000) + 1;
  const xpPercent = (state.profile.xp % 1000) / 10;
  const motivation = clock ? dailyQuote(clock) : DAILY_QUOTES[0];
  return <>
    <section className="hero-panel game-panel">
      <div className="arena-sun"/><div className="arena-silhouette"/><div className="arena-grid"/>
      <div className="hero-copy"><span className="season-tag"><i/> SEASON 01 · OPERATION REBIRTH</span><h1>RISE. FOCUS.<br/><em>CONQUER.</em></h1><p>Welcome back, {state.profile.name}. Your streak is alive. Complete 3 priority missions to unlock today&apos;s reward chest.</p><div className="daily-signal"><span>DAILY SIGNAL</span><q>{motivation.quote}</q><small>— {motivation.author}</small></div><div className="xp-row"><span>LEVEL {xpLevel}</span><div className="xp-track"><i style={{ width: `${xpPercent}%` }} /></div><strong>{state.profile.xp.toLocaleString()} XP</strong></div></div>
      <div className="hero-command-visual"><button className="hero-ai-reactor" onClick={openAssistant} aria-label="Ask Quest AI"><i className="ring-one"/><i className="ring-two"/><span><small>QUEST</small>AI<b>ONLINE</b></span></button><div className="day-orbit"><svg viewBox="0 0 160 160" role="img" aria-label={`Day ${state.profile.day} of 90`}><circle cx="80" cy="80" r="66" className="orbit-base"/><circle cx="80" cy="80" r="66" className="orbit-value" style={{ strokeDashoffset: 414 - (414 * state.profile.day / 90) }}/></svg><div><span>DAY</span><b>{state.profile.day}</b><small>OF 90</small></div></div></div>
    </section>
    <section className="module-strip">{modules.map(([icon, title, meta, color, tab]) => <button className="module-card" key={title} onClick={() => go(tab)} style={{ "--module-color": color } as CSSProperties}><span className="module-icon">{icon}</span><div><h3>{title}</h3><p>{meta}</p></div><b>›</b></button>)}</section>
    <section className="game-panel recommendation-panel"><div className="recommendation-heading"><div><span className="eyebrow">QUEST AI // LIVE RECOMMENDATION ENGINE</span><h2>Your tactical next moves</h2></div><button onClick={openAssistant}>OPEN AI COMPANION <span>→</span></button></div><div className="recommendation-grid">{recommendations.map((item, index) => <button key={item.code} className={`recommendation-card ${item.tone}`} onClick={() => go(item.tab)}><span className="recommendation-rank">0{index + 1}</span><div><small>{item.code}</small><strong>{item.title}</strong><p>{item.detail}</p><em>{item.action} →</em></div></button>)}</div></section>
    <section className="content-grid">
      <article className="game-panel mission-panel"><div className="panel-heading"><div><span className="eyebrow">DAILY QUESTLINE</span><h2>Today&apos;s missions</h2></div><span className="count-chip">{completedTasks} / {state.tasks.length} COMPLETE</span></div><div className="mission-list">{state.tasks.slice(0, 4).map((mission, index) => <button key={mission.id} className={`mission ${mission.done ? "completed" : ""}`} onClick={() => toggleTask(mission.id)}><span className="quest-check">{mission.done ? "✓" : index + 1}</span><span><strong>{mission.title}</strong><small>{mission.start} · {mission.duration} min</small></span><em>+{mission.xp} XP</em></button>)}</div><button className="primary-btn" onClick={() => go("planner")}>OPEN SMART PLANNER <span>→</span></button></article>
      <article className="game-panel streak-panel"><div className="panel-heading"><div><span className="eyebrow">COMBO MULTIPLIER</span><h2>Habit streaks</h2></div><button className="icon-btn" onClick={() => go("planner")}>＋</button></div>{state.habits.map((habit, index) => <div className="habit-row" key={habit.id}><span className="habit-gem" style={{ color: ["#31d7ff", "#8b5cf6", "#caff4a", "#ffb84d"][index % 4] }}>◆</span><div><strong>{habit.name}</strong><small>Current combo</small></div><b>{habit.streak}<small>DAYS</small></b><button className={habit.done ? "checked" : ""} onClick={() => toggleHabit(habit.id)}>✓</button></div>)}</article>
    </section>
  </>;
}

function ModuleHeader({ code, title, text, stat }: { code: string; title: string; text: string; stat?: string }) {
  return <header className="module-header"><div><span className="eyebrow">{code}</span><h1>{title}</h1><p>{text}</p></div>{stat && <div className="header-stat"><span>LIVE STAT</span><b>{stat}</b></div>}</header>;
}

function ResetModule({ state, setState, award, today }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; award: (xp: number, coins: number, message: string) => void; today: string }) {
  const phases = [{ name: "Ignition", range: "Days 1–22", desc: "Stabilize sleep, environment and basic routines." }, { name: "Momentum", range: "Days 23–66", desc: "Increase deep work and strengthen identity-based habits." }, { name: "Expansion", range: "Days 67–90", desc: "Raise difficulty, lead yourself and lock in the new standard." }];
  const phaseStarts = [1, 23, 67];
  const phaseEnds = [22, 66, 90];
  const morningClaimed = Boolean(today && state.checkin.morningClaimedOn === today);
  const eveningClaimed = Boolean(today && state.checkin.eveningClaimedOn === today);
  const claimCheckin = (period: "morning" | "evening") => {
    const field = period === "morning" ? state.checkin.morning : state.checkin.evening;
    const alreadyClaimed = period === "morning" ? morningClaimed : eveningClaimed;
    if (!today || !field.trim() || alreadyClaimed) return;
    setState((current) => ({ ...current, checkin: { ...current.checkin, [period === "morning" ? "morningClaimedOn" : "eveningClaimedOn"]: today } }));
    award(period === "morning" ? 30 : 40, period === "morning" ? 10 : 15, period === "morning" ? "Morning intention locked" : "Reflection saved");
  };
  return <>
    <ModuleHeader code="90-DAY CAMPAIGN // LIFE RESET" title="Rebuild. Level by level." text="Your reset adapts across three phases, with reflection checkpoints and real rewards." stat={`DAY ${state.profile.day} / 90`} />
    <div className="phase-grid">{phases.map((phase, index) => { const start = phaseStarts[index], end = phaseEnds[index]; const active = state.profile.day >= start && state.profile.day <= end; const progress = state.profile.day < start ? 0 : state.profile.day > end ? 100 : ((state.profile.day - start + 1) / (end - start + 1)) * 100; return <article className={`game-panel phase-card ${active ? "current" : ""}`} key={phase.name}><span>PHASE 0{index + 1}</span><h2>{phase.name}</h2><b>{phase.range}</b><p>{phase.desc}</p><div className="phase-bar"><i style={{ width: `${Math.min(100, progress)}%` }}/></div></article>; })}</div>
    <section className="game-panel timeline-panel"><div className="panel-heading"><div><span className="eyebrow">CAMPAIGN MAP</span><h2>90-day progression</h2></div><span className="count-chip">{state.profile.day >= 90 ? "CAMPAIGN COMPLETE" : `NEXT LEVEL IN ${10 - (state.profile.day % 10)} DAYS`}</span></div><div className="day-grid">{Array.from({ length: 90 }, (_, i) => i + 1).map((day) => <button key={day} className={day < state.profile.day ? "past" : day === state.profile.day ? "today" : day % 10 === 0 ? "boss" : "future"} title={`Day ${day}`}>{day % 10 === 0 ? `L${day / 10}` : day}</button>)}</div></section>
    <section className="two-column">
      <article className="game-panel form-panel"><span className="eyebrow">MORNING INTENTION</span><h2>Choose today&apos;s win</h2><label>My single most important outcome<textarea value={state.checkin.morning} onChange={(event) => setState((current) => ({ ...current, checkin: { ...current.checkin, morning: event.target.value } }))}/></label><label>Energy level <input type="range" min="1" max="5" value={state.checkin.energy} onChange={(event) => setState((current) => ({ ...current, checkin: { ...current.checkin, energy: Number(event.target.value) } }))}/><span className="range-value">{state.checkin.energy} / 5</span></label><button className="primary-btn" disabled={!state.checkin.morning.trim() || morningClaimed} onClick={() => claimCheckin("morning")}>{morningClaimed ? "INTENTION LOCKED TODAY" : "LOCK INTENTION"}</button></article>
      <article className="game-panel form-panel"><span className="eyebrow">EVENING REFLECTION</span><h2>Save the lesson</h2><label>What worked, and what will I improve?<textarea placeholder="Write an honest two-minute reflection..." value={state.checkin.evening} onChange={(event) => setState((current) => ({ ...current, checkin: { ...current.checkin, evening: event.target.value } }))}/></label><button className="secondary-btn" disabled={!state.checkin.evening.trim() || eveningClaimed} onClick={() => claimCheckin("evening")}>{eveningClaimed ? "REFLECTION SAVED TODAY" : "COMPLETE DAILY CHECK-IN"}</button></article>
    </section>
  </>;
}

function PlannerModule({ state, setState, toggleTask, toggleHabit, notify }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; toggleTask: (id: number) => void; toggleHabit: (id: number) => void; notify: (message: string) => void }) {
  const [task, setTask] = useState({ title: "", duration: 45, priority: "Medium" as Task["priority"] });
  const [habitName, setHabitName] = useState("");
  const addTask = (event: FormEvent) => { event.preventDefault(); if (!task.title.trim()) return; setState((current) => ({ ...current, tasks: [...current.tasks, { id: nextId(), title: task.title, duration: task.duration, priority: task.priority, start: "--:--", done: false, xp: task.priority === "High" ? 120 : task.priority === "Medium" ? 75 : 40 }] })); setTask({ title: "", duration: 45, priority: "Medium" }); };
  const optimize = () => { let minutes = 270; const ordered = [...state.tasks].sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority])); const mapped = ordered.map((item) => { const start = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; minutes += item.duration + 15; return { ...item, start }; }); setState((current) => ({ ...current, tasks: mapped })); notify("Schedule optimized from 04:30 with recovery buffers"); };
  return <>
    <ModuleHeader code="AI TIME-BLOCKING // DAILY LOADOUT" title="Plan less. Execute more." text="Add missions, assign priority, then let the optimizer create a focused day with recovery buffers." stat={`${state.profile.focusMinutes} FOCUS MIN`} />
    <section className="planner-layout">
      <article className="game-panel schedule-panel"><div className="panel-heading"><div><span className="eyebrow">MISSION QUEUE</span><h2>Today&apos;s optimized timeline</h2></div><button className="glow-btn" onClick={optimize}>⚡ OPTIMIZE DAY</button></div><div className="timeline-list">{state.tasks.map((item) => <button className={`time-block ${item.done ? "completed" : ""}`} key={item.id} onClick={() => toggleTask(item.id)}><time>{item.start}</time><i/><div><strong>{item.title}</strong><span>{item.duration} min · {item.priority} priority</span></div><em>{item.done ? "CLEARED" : `+${item.xp} XP`}</em></button>)}</div></article>
      <article className="game-panel form-panel"><span className="eyebrow">ADD MISSION</span><h2>New task</h2><form onSubmit={addTask}><label>Mission name<input value={task.title} onChange={(event) => setTask({ ...task, title: event.target.value })} placeholder="e.g. Complete Python module"/></label><div className="form-row"><label>Duration<input type="number" min="10" step="5" value={task.duration} onChange={(event) => setTask({ ...task, duration: Number(event.target.value) })}/></label><label>Priority<select value={task.priority} onChange={(event) => setTask({ ...task, priority: event.target.value as Task["priority"] })}><option>High</option><option>Medium</option><option>Low</option></select></label></div><button className="primary-btn" type="submit">ADD TO QUEUE</button></form></article>
    </section>
    <section className="game-panel habit-board"><div className="panel-heading"><div><span className="eyebrow">HABIT COMBOS</span><h2>Daily streak tracker</h2></div><span className="count-chip">COINS ON COMPLETION</span></div><div className="habit-cards">{state.habits.map((habit) => <button className={`habit-card ${habit.done ? "completed" : ""}`} key={habit.id} onClick={() => toggleHabit(habit.id)}><span className="habit-check">{habit.done ? "✓" : "◇"}</span><div><strong>{habit.name}</strong><small>{habit.streak} day combo</small></div><em>◈ +{habit.reward}</em></button>)}</div><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (!habitName.trim()) return; setState((current) => ({ ...current, habits: [...current.habits, { id: nextId(), name: habitName, streak: 0, done: false, reward: 15 }] })); setHabitName(""); }}><input value={habitName} onChange={(event) => setHabitName(event.target.value)} placeholder="Add a small daily habit..."/><button>＋ ADD HABIT</button></form></section>
  </>;
}

function RevisionModule({ state, setState, award, today }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; award: (xp: number, coins: number, message: string) => void; today: string }) {
  const [source, setSource] = useState({ title: "", url: "" });
  const [quiz, setQuiz] = useState<Revision | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const dueToday = state.revisions.filter((item) => { const due = today ? revisionDate(item, today) : undefined; return !item.done && (due ? due <= today : item.nextReview === "Today"); }).length;
  const questions = quiz ? [{ q: `Which method best strengthens recall for ${quiz.title}?`, options: ["Active recall", "Passive rereading", "Skipping practice", "Memorizing titles"], correct: "Active recall" }, { q: "Which revision interval comes after Day 7?", options: ["Day 30", "Day 8", "Day 10", "Day 60"], correct: "Day 30" }] : [];
  const submitQuiz = () => {
    if (!quiz || Object.keys(answers).length !== questions.length) return;
    const correct = questions.filter((question, index) => answers[index] === question.correct).length;
    setState((current) => ({ ...current, revisions: current.revisions.map((item) => item.id === quiz.id ? { ...item, mastery: Math.min(100, item.mastery + (correct * 8)), level: Math.min(9, item.level + (correct === questions.length ? 1 : 0)), nextReview: "In 3 days", reviewDate: today ? shiftDateKey(today, 3) : item.reviewDate, done: true } : item) }));
    setQuiz(null);
    setAnswers({});
    award(correct * 40, correct * 15, `Revision battle: ${correct}/${questions.length} correct`);
  };
  return <>
    <ModuleHeader code="SPACED REPETITION // KNOWLEDGE ARENA" title="Turn content into memory." text="Save a learning link, generate a quick quiz, and fight forgetting on Days 1, 3, 7 and 30." stat={`${dueToday} DUE TODAY`} />
    <section className="revision-layout">
      <article className="game-panel revision-list"><div className="panel-heading"><div><span className="eyebrow">ACTIVE DECKS</span><h2>Revision quests</h2></div><span className="count-chip">LEVELS 1–9</span></div>{state.revisions.map((item) => <div className="revision-card" key={item.id}><div className="deck-level">L{item.level}</div><div className="revision-main"><strong>{item.title}</strong><span>Next review: <b>{today ? revisionLabel(item, today) : item.nextReview}</b></span><div className="mastery"><i style={{ width: `${item.mastery}%` }}/></div></div><em>{item.mastery}%</em><button disabled={item.done} onClick={() => { setAnswers({}); setQuiz(item); }}>{item.done ? "COMPLETED TODAY" : "START QUIZ"}</button></div>)}</article>
      <article className="game-panel form-panel"><span className="eyebrow">IMPORT KNOWLEDGE</span><h2>Add learning source</h2><label>Topic name<input value={source.title} onChange={(event) => setSource({ ...source, title: event.target.value })} placeholder="e.g. Decision Trees"/></label><label>YouTube / course link<input value={source.url} onChange={(event) => setSource({ ...source, url: event.target.value })} placeholder="Paste URL"/></label><div className="info-chip">AI quiz generation uses the source title in this prototype. Connect a transcript service for full video analysis.</div><button className="primary-btn" onClick={() => { if (!source.title || !source.url) return; setState((current) => ({ ...current, revisions: [...current.revisions, { id: nextId(), title: source.title, url: source.url, nextReview: "Today", reviewDate: today || undefined, mastery: 0, level: 1, done: false }] })); setSource({ title: "", url: "" }); }}>CREATE REVISION DECK</button></article>
    </section>
    <section className="spaced-strip">{[1, 3, 7, 30].map((day, index) => <div key={day}><span>CHECKPOINT 0{index + 1}</span><b>DAY {day}</b><small>{["Quick recall", "Strengthen", "Consolidate", "Long-term lock"][index]}</small></div>)}</section>
    {quiz && <div className="modal-backdrop"><section className="quiz-modal game-panel"><button className="modal-close" onClick={() => { setQuiz(null); setAnswers({}); }}>×</button><span className="eyebrow">QUIZ // {quiz.title}</span><h2>Knowledge battle</h2>{questions.map((question, index) => <div className="quiz-question" key={question.q}><strong>{index + 1}. {question.q}</strong>{question.options.map((option) => <label key={option}><input type="radio" name={`q${index}`} checked={answers[index] === option} onChange={() => setAnswers((current) => ({ ...current, [index]: option }))}/><span>{option}</span></label>)}</div>)}<button className="glow-btn full" disabled={Object.keys(answers).length !== questions.length} onClick={submitQuiz}>SUBMIT & CLAIM REWARD</button></section></div>}
  </>;
}

function AlarmModule({ state, setState, notify, permission, prepareAlerts, testAlarm }: {
  state: LifeQuestState;
  setState: React.Dispatch<React.SetStateAction<LifeQuestState>>;
  notify: (message: string) => void;
  permission: AlarmPermission;
  prepareAlerts: () => Promise<AlarmPermission>;
  testAlarm: (alarm?: Alarm) => Promise<void>;
}) {
  const [alarm, setAlarm] = useState({ time: "04:00", label: "", mission: "Math challenge" });
  const nextAlarm = state.alarms.filter((item) => item.enabled).sort((a, b) => a.time.localeCompare(b.time))[0];
  const armAlarm = async () => {
    if (!alarm.label.trim()) {
      notify("Add an alarm label first");
      return;
    }
    await prepareAlerts();
    setState((current) => ({ ...current, alarms: [...current.alarms, { ...alarm, label: alarm.label.trim(), id: nextId(), enabled: true }] }));
    setAlarm({ time: "04:00", label: "", mission: "Math challenge" });
    notify("Alarm armed. Keep the installed app open for web scheduling.");
  };
  return <>
    <ModuleHeader code="MISSION ALARM // WAKE PROTOCOL" title="Defeat snooze mode." text="Schedule mission-based alarms. Complete a challenge to claim your wake-up streak and coins." stat={`${state.alarms.filter((item) => item.enabled).length} ARMED`} />
    <section className="alarm-layout">
      <article className="game-panel alarm-clock"><span className="eyebrow">NEXT WAKE EVENT</span><div className="digital-time">{nextAlarm?.time || "--:--"}</div><p>{nextAlarm?.label || "No alarm armed"}</p><div className="mission-badge">MISSION: {nextAlarm?.mission.toUpperCase() || "NONE"}</div><div className={`alarm-readiness ${permission === "granted" ? "ready" : ""}`}><span>NOTIFICATIONS</span><b>{permission === "granted" ? "READY" : permission === "denied" ? "BLOCKED" : permission === "unsupported" ? "UNSUPPORTED" : "ACTION NEEDED"}</b></div><button className="glow-btn full" onClick={() => void testAlarm(nextAlarm)}>TEST SOUND & DISMISSAL</button><button className="secondary-btn full" onClick={async () => { const result = await prepareAlerts(); notify(result === "granted" ? "Alarm notifications enabled" : "Sound prepared; allow notifications in browser settings"); }}>ENABLE ALARM ALERTS</button><small>Web/PWA alarms ring while LifeQuest remains open or active in the background. Android/iOS can suspend or close web apps, so a guaranteed closed-app alarm requires native mobile packaging.</small></article>
      <article className="game-panel alarm-list"><div className="panel-heading"><div><span className="eyebrow">WAKE LOADOUT</span><h2>Your alarms</h2></div></div>{state.alarms.map((item) => <div className="alarm-row" key={item.id}><time>{item.time}</time><div><strong>{item.label}</strong><span>{item.mission}</span></div><div className="alarm-actions"><button aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.label}`} className={`toggle ${item.enabled ? "on" : ""}`} onClick={async () => { if (!item.enabled) await prepareAlerts(); setState((current) => ({ ...current, alarms: current.alarms.map((alarmItem) => alarmItem.id === item.id ? { ...alarmItem, enabled: !alarmItem.enabled } : alarmItem) })); }}><i/></button><button className="alarm-delete" aria-label={`Delete ${item.label}`} onClick={() => setState((current) => ({ ...current, alarms: current.alarms.filter((alarmItem) => alarmItem.id !== item.id) }))}>×</button></div></div>)}<div className="form-row alarm-form"><input type="time" aria-label="Alarm time" value={alarm.time} onChange={(event) => setAlarm({ ...alarm, time: event.target.value })}/><input aria-label="Alarm label" placeholder="Alarm label" value={alarm.label} onChange={(event) => setAlarm({ ...alarm, label: event.target.value })}/><select aria-label="Dismissal mission" value={alarm.mission} onChange={(event) => setAlarm({ ...alarm, mission: event.target.value })}><option>Math challenge</option><option>20-tap wake check</option><option>Memory challenge</option></select></div><button className="primary-btn" onClick={() => void armAlarm()}>ARM NEW ALARM</button></article>
    </section>
  </>;
}

function AlarmMission({ alarm, dismiss, notify }: { alarm: Alarm; dismiss: () => void; notify: (message: string) => void }) {
  const [taps, setTaps] = useState(0);
  const mission = alarm.mission.toLowerCase();
  const isTapMission = mission.includes("20");
  const isMemoryMission = mission.includes("memory");

  return <div className="modal-backdrop alarm-active"><section className="quiz-modal alarm-mission game-panel" role="alertdialog" aria-modal="true" aria-label={`${alarm.label} alarm`}>
    <span className="eyebrow">ALARM RINGING // {alarm.time}</span>
    <h3>{alarm.label}</h3>
    {isTapMission ? <>
      <h2>{taps} / 20</h2>
      <p>Tap twenty times to prove you are awake.</p>
      <button className="glow-btn full alarm-tap" onClick={() => { const next = taps + 1; setTaps(next); if (next >= 20) dismiss(); }}>TAP TO WAKE</button>
    </> : isMemoryMission ? <>
      <h2>7 · 2 · 9</h2>
      <p>Select the matching memory code.</p>
      <div className="answer-grid">{["792", "729", "927", "279"].map((answer) => <button key={answer} onClick={() => answer === "729" ? dismiss() : notify("Wrong code — look carefully and retry")}>{answer}</button>)}</div>
    </> : mission.includes("math") ? <>
      <h2>17 × 6 = ?</h2>
      <div className="answer-grid">{[92, 102, 112, 96].map((answer) => <button key={answer} onClick={() => answer === 102 ? dismiss() : notify("Wrong answer — stay awake and retry")}>{answer}</button>)}</div>
    </> : <>
      <h2>WAKE CHECK</h2>
      <p>This older alarm used a mission unavailable in the web app. Confirm that you are awake to dismiss it.</p>
      <button className="glow-btn full" onClick={dismiss}>I&apos;M AWAKE — DISMISS</button>
    </>}
  </section></div>;
}

function ReminderModule({ state, setState, notify, permission, prepareAlerts, today }: {
  state: LifeQuestState;
  setState: React.Dispatch<React.SetStateAction<LifeQuestState>>;
  notify: (message: string) => void;
  permission: AlarmPermission;
  prepareAlerts: () => Promise<AlarmPermission>;
  today: string;
}) {
  const [draft, setDraft] = useState<Pick<Reminder, "title" | "date" | "time" | "repeat">>({
    title: "",
    date: today,
    time: "09:00",
    repeat: "once",
  });
  const reminders = state.reminders || [];
  const addReminder = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.time || !draft.date) {
      notify("Add a title, date and time");
      return;
    }
    await prepareAlerts();
    setState((current) => ({
      ...current,
      reminders: [...(current.reminders || []), { ...draft, title: draft.title.trim(), id: nextId(), enabled: true }],
    }));
    setDraft((current) => ({ ...current, title: "" }));
    notify("Reminder saved to your profile");
  };
  return <>
    <ModuleHeader code="REMINDER CENTER // PERSONAL SCHEDULE" title="Remember what matters." text="Create one-time or daily reminders. They sync with your LifeQuest profile across signed-in devices." stat={`${reminders.filter((item) => item.enabled).length} ACTIVE`} />
    <section className="reminder-layout">
      <article className="game-panel form-panel"><span className="eyebrow">NEW REMINDER</span><h2>Schedule a notification</h2><form onSubmit={(event) => void addReminder(event)}><label>Reminder title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Take medicine"/></label><div className="form-row reminder-form-row"><label>Date<input type="date" min={today || undefined} value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })}/></label><label>Time<input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })}/></label><label>Repeat<select value={draft.repeat} onChange={(event) => setDraft({ ...draft, repeat: event.target.value as Reminder["repeat"] })}><option value="once">Once</option><option value="daily">Every day</option></select></label></div><button className="primary-btn" type="submit">SAVE REMINDER</button></form><button className="secondary-btn full" onClick={async () => { const result = await prepareAlerts(); notify(result === "granted" ? "Reminder notifications enabled" : "Allow notifications in browser settings"); }}>ENABLE NOTIFICATIONS</button><p className="info-chip">For reliable background reminders, install the PWA and allow notifications. Phone battery-saving rules may still pause a closed web app.</p></article>
      <article className="game-panel reminder-list"><div className="panel-heading"><div><span className="eyebrow">YOUR SCHEDULE</span><h2>Upcoming reminders</h2></div><span className={`count-chip ${permission === "granted" ? "" : "warning"}`}>{permission === "granted" ? "NOTIFICATIONS READY" : "ENABLE NOTIFICATIONS"}</span></div>{reminders.length === 0 && <div className="empty-state"><b>No reminders yet</b><span>Add your first reminder from the form.</span></div>}{[...reminders].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((item) => <div className="reminder-row" key={item.id}><div className="reminder-date"><time>{item.time}</time><span>{item.repeat === "daily" ? "EVERY DAY" : item.date ? dateFromKey(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }).toUpperCase() : "ONCE"}</span></div><div><strong>{item.title}</strong><small>{item.enabled ? "Scheduled" : "Paused"}</small></div><div className="alarm-actions"><button className={`toggle ${item.enabled ? "on" : ""}`} aria-label={`${item.enabled ? "Pause" : "Enable"} ${item.title}`} onClick={async () => { if (!item.enabled) await prepareAlerts(); setState((current) => ({ ...current, reminders: (current.reminders || []).map((reminder) => reminder.id === item.id ? { ...reminder, enabled: !reminder.enabled } : reminder) })); }}><i/></button><button className="alarm-delete" aria-label={`Delete ${item.title}`} onClick={() => setState((current) => ({ ...current, reminders: (current.reminders || []).filter((reminder) => reminder.id !== item.id) }))}>×</button></div></div>)}</article>
    </section>
  </>;
}

function GymModule({ state, setState, award, currentDayCode }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; award: (xp: number, coins: number, message: string) => void; currentDayCode: string }) {
  const [manualDay, setManualDay] = useState<string | null>(null);
  const selectedDay = manualDay || currentDayCode;
  const [draft, setDraft] = useState({ muscles: "", exercise: "", sets: 3, reps: "10–12" });
  const workout = state.workouts.find((item) => item.day === selectedDay)!;
  const updateWorkout = (updater: (item: WorkoutDay) => WorkoutDay) => setState((current) => ({ ...current, workouts: current.workouts.map((item) => item.day === selectedDay ? updater(item) : item) }));
  return <>
    <ModuleHeader code="TRAINING CAMPAIGN // BODY STATS" title="Build your weekly split." text="Choose what muscles to train each day, track sets and reps, and gain XP after every completed workout." stat={`${state.workouts.filter((day) => day.complete).length} / 7 DAYS`} />
    <section className="week-strip">{state.workouts.map((day) => <button key={day.day} className={`${day.day === selectedDay ? "active" : ""} ${day.complete ? "complete" : ""}`} onClick={() => setManualDay(day.day)}><span>{day.day}</span><b>{day.muscles}</b><i>{day.complete ? "✓ CLEARED" : "PLANNED"}</i></button>)}</section>
    <section className="gym-layout">
      <article className="game-panel workout-panel"><div className="panel-heading"><div><span className="eyebrow">{selectedDay} LOADOUT</span><h2>{workout.muscles}</h2></div><span className="count-chip">+150 XP</span></div><div className="exercise-table"><div className="table-head"><span>EXERCISE</span><span>SETS</span><span>REPS / TIME</span><span>STATUS</span></div>{workout.exercises.map((exercise) => <button className={exercise.done ? "done" : ""} key={exercise.id} onClick={() => updateWorkout((item) => ({ ...item, exercises: item.exercises.map((entry) => entry.id === exercise.id ? { ...entry, done: !entry.done } : entry) }))}><strong>{exercise.name}</strong><span>{exercise.sets}</span><span>{exercise.reps}</span><em>{exercise.done ? "✓ DONE" : "MARK DONE"}</em></button>)}</div><button className="glow-btn full" disabled={workout.complete} onClick={() => { updateWorkout((item) => ({ ...item, complete: true, exercises: item.exercises.map((entry) => ({ ...entry, done: true })) })); award(150, 50, `${selectedDay} workout cleared`); }}>{workout.complete ? "WORKOUT ALREADY CLEARED" : "COMPLETE WORKOUT"}</button></article>
      <article className="game-panel form-panel"><span className="eyebrow">EDIT {selectedDay}</span><h2>Set muscles & exercise</h2><label>Muscle groups<input placeholder={workout.muscles} value={draft.muscles} onChange={(event) => setDraft({ ...draft, muscles: event.target.value })}/></label><button className="secondary-btn compact" onClick={() => { if (!draft.muscles) return; updateWorkout((item) => ({ ...item, muscles: draft.muscles })); setDraft({ ...draft, muscles: "" }); }}>UPDATE DAY SPLIT</button><div className="divider"/><label>Exercise name<input placeholder="e.g. Dumbbell fly" value={draft.exercise} onChange={(event) => setDraft({ ...draft, exercise: event.target.value })}/></label><div className="form-row"><label>Sets<input type="number" min="1" value={draft.sets} onChange={(event) => setDraft({ ...draft, sets: Number(event.target.value) })}/></label><label>Reps / time<input value={draft.reps} onChange={(event) => setDraft({ ...draft, reps: event.target.value })}/></label></div><button className="primary-btn" onClick={() => { if (!draft.exercise) return; updateWorkout((item) => ({ ...item, exercises: [...item.exercises, { id: nextId(), name: draft.exercise, sets: draft.sets, reps: draft.reps, done: false }] })); setDraft({ ...draft, exercise: "", sets: 3, reps: "10–12" }); }}>ADD EXERCISE</button></article>
    </section>
  </>;
}

function ExpenseModule({ state, setState, total, notify, today }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; total: number; notify: (message: string) => void; today: string }) {
  const [entry, setEntry] = useState({ title: "", category: "Food", amount: 0, date: today });
  const remaining = state.expenses.budget - total;
  const budgetPercent = state.expenses.budget > 0 ? Math.round((total / state.expenses.budget) * 100) : 0;
  const currentMonthKey = today.slice(0, 7);
  const currentItems = useMemo(() => state.expenses.items.filter((item) => !currentMonthKey || item.date.startsWith(currentMonthKey)), [state.expenses.items, currentMonthKey]);
  const categories = useMemo(() => currentItems.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + item.amount }), {}), [currentItems]);
  const currentMonth = today ? dateFromKey(today).toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase() : "CURRENT MONTH";
  return <>
    <ModuleHeader code={`CREDIT CONTROL // ${currentMonth}`} title="Command your money." text="Set a monthly budget, store every expense, and protect the coins that matter in real life." stat={`${budgetPercent}% USED`} />
    <section className="finance-stats"><article className="game-panel"><span>MONTHLY BUDGET</span><b>{formatMoney(state.expenses.budget)}</b><input type="number" value={state.expenses.budget} onChange={(event) => setState((current) => ({ ...current, expenses: { ...current.expenses, budget: Number(event.target.value) } }))}/></article><article className="game-panel"><span>TOTAL SPENT</span><b>{formatMoney(total)}</b><small>{currentItems.length} transactions</small></article><article className={`game-panel ${remaining < 0 ? "danger" : ""}`}><span>REMAINING</span><b>{formatMoney(remaining)}</b><small>{remaining >= 0 ? "Budget shield active" : "Budget exceeded"}</small></article></section>
    <section className="expense-layout">
      <article className="game-panel expense-log"><div className="panel-heading"><div><span className="eyebrow">TRANSACTION LOG</span><h2>This month&apos;s expenses</h2></div></div><div className="expense-table">{currentItems.slice().reverse().map((item) => <div key={item.id}><span className="expense-icon">{item.category === "Food" ? "🍲" : item.category === "Fitness" ? "◆" : item.category === "Housing" ? "⌂" : "₹"}</span><div><strong>{item.title}</strong><small>{item.category} · {item.date}</small></div><b>-{formatMoney(item.amount)}</b><button onClick={() => setState((current) => ({ ...current, expenses: { ...current.expenses, items: current.expenses.items.filter((entryItem) => entryItem.id !== item.id) } }))}>×</button></div>)}</div></article>
      <article className="game-panel form-panel"><span className="eyebrow">LOG EXPENSE</span><h2>New transaction</h2><label>Description<input value={entry.title} onChange={(event) => setEntry({ ...entry, title: event.target.value })} placeholder="What did you spend on?"/></label><div className="form-row"><label>Amount<input type="number" min="0" value={entry.amount || ""} onChange={(event) => setEntry({ ...entry, amount: Number(event.target.value) })}/></label><label>Category<select value={entry.category} onChange={(event) => setEntry({ ...entry, category: event.target.value })}><option>Food</option><option>Housing</option><option>Fitness</option><option>Education</option><option>Travel</option><option>Fun</option><option>Other</option></select></label></div><label>Date<input type="date" value={entry.date || today} onChange={(event) => setEntry({ ...entry, date: event.target.value })}/></label><button className="primary-btn" onClick={() => { if (!entry.title || entry.amount <= 0 || !today) return; const datedEntry = { ...entry, date: entry.date || today }; setState((current) => ({ ...current, expenses: { ...current.expenses, items: [...current.expenses.items, { ...datedEntry, id: nextId() }] } })); setEntry({ title: "", category: "Food", amount: 0, date: today }); notify("Expense stored in monthly ledger"); }}>STORE EXPENSE</button><div className="category-mini">{Object.entries(categories).map(([category, amount]) => <div key={category}><span>{category}</span><i><b style={{ width: `${Math.min(100, (amount / total) * 100)}%` }}/></i><em>{formatMoney(amount)}</em></div>)}</div></article>
    </section>
  </>;
}

function RewardModule({ state, setState, notify, today }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; notify: (message: string) => void; today: string }) {
  const [reward, setReward] = useState({ title: "", emoji: "🎁", cost: 200, cooldown: "Once a week" });
  const [category, setCategory] = useState<"all" | StoreItem["kind"]>("all");
  const owned = state.store?.owned || ["theme-cyber", "sticker-focus"];
  const equipped = state.store?.equipped || { theme: "theme-cyber", sticker: "sticker-focus" };
  const cooldownReady = (item: Reward) => {
    if (item.cooldown === "Level reward") return item.redeemed === 0;
    if (!item.lastRedeemedOn || !today) return true;
    if (item.cooldown === "Once a week") return daysBetween(item.lastRedeemedOn, today) >= 7;
    return item.lastRedeemedOn !== today;
  };
  const buyOrEquip = (item: StoreItem) => {
    if (!owned.includes(item.id) && state.profile.coins < item.cost) return;
    setState((current) => {
      const currentOwned = current.store?.owned || ["theme-cyber", "sticker-focus"];
      const isOwned = currentOwned.includes(item.id);
      return { ...current, profile: isOwned ? current.profile : { ...current.profile, coins: current.profile.coins - item.cost }, settings: item.theme ? { ...current.settings, theme: item.theme } : current.settings, store: { owned: isOwned ? currentOwned : [...currentOwned, item.id], equipped: { ...(current.store?.equipped || {}), [item.kind]: item.id } } };
    });
    notify(owned.includes(item.id) ? `${item.name} equipped` : `${item.name} unlocked and equipped!`);
  };
  return <>
    <ModuleHeader code="LIFEQUEST MARKET // COIN STORE" title="Earn it. Own it. Equip it." text="Use mission coins to unlock themes, stickers, badges and player effects—or redeem balanced real-life rewards." stat={`◈ ${state.profile.coins.toLocaleString("en-IN")}`} />
    <section className="store-toolbar"><div><span className="eyebrow">COSMETIC ARMORY</span><h2>Customize your game</h2></div><div className="store-tabs">{(["all", "theme", "sticker", "badge", "effect"] as const).map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item.toUpperCase()}</button>)}</div></section>
    <section className="store-grid">{STORE_ITEMS.filter((item) => category === "all" || item.kind === category).map((item) => { const isOwned = owned.includes(item.id); const isEquipped = equipped[item.kind] === item.id; const canAfford = state.profile.coins >= item.cost; return <article className={`game-panel store-card ${item.rarity.toLowerCase()} ${isEquipped ? "equipped" : ""}`} key={item.id}><div className="store-preview"><span>{item.icon}</span><i>{item.kind}</i></div><div className="store-meta"><small>{item.rarity} {item.kind.toUpperCase()}</small><h3>{item.name}</h3><p>{item.description}</p></div><button disabled={!isOwned && !canAfford} onClick={() => buyOrEquip(item)}>{isEquipped ? "✓ EQUIPPED" : isOwned ? "EQUIP" : `◈ ${item.cost} UNLOCK`}</button></article>; })}</section>
    <div className="vault-divider"><span>REAL-LIFE REWARD VAULT</span></div>
    <section className="reward-grid">{state.rewards.map((item) => { const canAfford = state.profile.coins >= item.cost; const ready = cooldownReady(item); return <article className={`game-panel reward-card ${canAfford && ready ? "available" : "locked"}`} key={item.id}><div className="reward-emoji">{item.emoji}</div><span>{ready ? canAfford ? "REWARD AVAILABLE" : "MORE COINS NEEDED" : "COOLDOWN ACTIVE"}</span><h2>{item.title}</h2><p>{item.cooldown} · Redeemed {item.redeemed} times</p><button disabled={!canAfford || !ready} onClick={() => { setState((current) => ({ ...current, profile: { ...current.profile, coins: current.profile.coins - item.cost }, rewards: current.rewards.map((rewardItem) => rewardItem.id === item.id ? { ...rewardItem, redeemed: rewardItem.redeemed + 1, lastRedeemedOn: today } : rewardItem) })); notify(`${item.title} unlocked — enjoy it guilt-free!`); }}>{ready ? `◈ ${item.cost} COINS` : "WAIT FOR COOLDOWN"}</button></article>; })}</section>
    <section className="game-panel custom-reward"><div><span className="eyebrow">CREATE YOUR OWN</span><h2>Custom reward drop</h2><p>Use rewards that refresh you without taking control of the day.</p></div><input value={reward.emoji} aria-label="Reward emoji" onChange={(event) => setReward({ ...reward, emoji: event.target.value })}/><input value={reward.title} placeholder="Reward name" onChange={(event) => setReward({ ...reward, title: event.target.value })}/><input type="number" min="10" value={reward.cost} onChange={(event) => setReward({ ...reward, cost: Number(event.target.value) })}/><select value={reward.cooldown} onChange={(event) => setReward({ ...reward, cooldown: event.target.value })}><option>Once a day</option><option>Once a week</option><option>Level reward</option></select><button className="primary-btn" onClick={() => { if (!reward.title) return; setState((current) => ({ ...current, rewards: [...current.rewards, { ...reward, id: nextId(), redeemed: 0 }] })); setReward({ title: "", emoji: "🎁", cost: 200, cooldown: "Once a week" }); }}>ADD TO VAULT</button></section>
  </>;
}

function ChangeModule({ state, setState, notify }: { state: LifeQuestState; setState: React.Dispatch<React.SetStateAction<LifeQuestState>>; notify: (message: string) => void }) {
  const [mode, setMode] = useState<"build" | "break">("build");
  const [draft, setDraft] = useState({ name: "", identity: "", cue: "", action: "" });
  const principles = mode === "build" ? [{ n: "01", title: "Make it obvious", text: "Attach a clear cue to an existing routine." }, { n: "02", title: "Make it tiny", text: "Start with a two-minute version to reduce friction." }, { n: "03", title: "Protect attention", text: "Use environment design, mindful restraint and a clear daily purpose." }, { n: "04", title: "Reward repetition", text: "Celebrate showing up; intensity can grow later." }] : [{ n: "01", title: "Make it invisible", text: "Remove the cue from your environment." }, { n: "02", title: "Add friction", text: "Increase the steps needed to start the unwanted action." }, { n: "03", title: "Replace, don&apos;t erase", text: "Choose a healthier response for the same trigger." }, { n: "04", title: "Recover quickly", text: "A missed day is data. Return at the next opportunity." }];
  return <>
    <ModuleHeader code="IDENTITY LAB // BEHAVIOUR SYSTEM" title="Build one. Break one." text="Combine Atomic Habits, attention discipline, gentle yogic restraint and practical Ayurvedic routine cues—without guilt or extreme rules." stat={`${state.changeHabits.length} PROTOCOLS`} />
    <div className="mode-switch"><button className={mode === "build" ? "active" : ""} onClick={() => setMode("build")}>＋ BUILD A HABIT</button><button className={mode === "break" ? "active" : ""} onClick={() => setMode("break")}>− BREAK A HABIT</button></div>
    <section className="principle-grid">{principles.map((item) => <article className="game-panel" key={item.n}><span>{item.n}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</section>
    <section className="change-layout">
      <article className="game-panel protocol-list"><div className="panel-heading"><div><span className="eyebrow">ACTIVE PROTOCOLS</span><h2>Identity quests</h2></div></div>{state.changeHabits.map((habit) => <button className={`protocol ${habit.done ? "done" : ""}`} key={habit.id} onClick={() => { const direction = habit.done ? -1 : 1; setState((current) => ({ ...current, profile: { ...current.profile, xp: Math.max(0, current.profile.xp + (direction * 60)), coins: Math.max(0, current.profile.coins + (direction * Math.round(20 * (current.settings?.coinMultiplier || 1)))) }, changeHabits: current.changeHabits.map((item) => item.id === habit.id ? { ...item, done: !item.done, streak: item.done ? Math.max(0, item.streak - 1) : item.streak + 1 } : item) })); if (!habit.done) notify("Identity vote recorded  +60 XP"); }}><span>{habit.type === "build" ? "+" : "−"}</span><div><strong>{habit.name}</strong><small>{habit.identity}</small><em>IF {habit.cue} → THEN {habit.action}</em></div><b>{habit.streak}<small>DAYS</small></b></button>)}</article>
      <article className="game-panel form-panel"><span className="eyebrow">{mode.toUpperCase()} PROTOCOL</span><h2>Design the behaviour</h2><label>Habit<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={mode === "build" ? "Habit to build" : "Habit to break"}/></label><label>Identity statement<input value={draft.identity} onChange={(event) => setDraft({ ...draft, identity: event.target.value })} placeholder="I am someone who..."/></label><label>Cue / trigger<input value={draft.cue} onChange={(event) => setDraft({ ...draft, cue: event.target.value })} placeholder="When / after..."/></label><label>{mode === "build" ? "Two-minute action" : "Replacement action"}<input value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} placeholder="I will..."/></label><button className="primary-btn" onClick={() => { if (!draft.name || !draft.action) return; setState((current) => ({ ...current, changeHabits: [...current.changeHabits, { ...draft, id: nextId(), type: mode, streak: 0, done: false }] })); setDraft({ name: "", identity: "", cue: "", action: "" }); }}>ACTIVATE PROTOCOL</button></article>
    </section>
    <div className="wisdom-note"><span>✦</span><p><strong>Practice, not punishment.</strong> Traditional wellness ideas here are used as gentle routine prompts—not medical advice, moral judgment, or a substitute for professional care.</p></div>
  </>;
}
