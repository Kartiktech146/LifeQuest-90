type ChatMessage = { role: "user" | "assistant"; content: string };

function compactContext(value: unknown, active: string) {
  const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const history = Array.isArray(state.history) ? state.history.slice(-7) : [];
  return { activeScreen: active, profile: state.profile, tasks: state.tasks, habits: state.habits, revisions: state.revisions, alarms: state.alarms, expenses: state.expenses, rewards: state.rewards, workouts: state.workouts, changeHabits: state.changeHabits, checkin: state.checkin, recentHistory: history };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
    const body = await request.json() as { message?: string; messages?: ChatMessage[]; state?: unknown; active?: string };
    const message = body.message?.trim();
    if (!message) return Response.json({ error: "message is required" }, { status: 400 });
    if (message.length > 4000) return Response.json({ error: "MESSAGE_TOO_LONG" }, { status: 413 });
    const history = (body.messages || []).slice(-10).map((item) => ({ role: item.role, content: [{ type: item.role === "assistant" ? "output_text" : "input_text", text: item.content }] }));
    const context = JSON.stringify(compactContext(body.state, body.active || "overview"));
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: `You are Quest AI, the real digital brain inside LifeQuest 90. Generate every answer from the user's query and supplied context; never select from canned or predefined replies. You can answer questions across study, productivity, habits, fitness, budgeting, planning, technology, general knowledge, and the LifeQuest app. Use the private app context only when it helps personalize the answer. Never invent progress or facts that are absent. Reply in the user's language (Hindi, Hinglish, or English), keep advice practical, and ask a focused follow-up only when essential. Be cautious with medical, financial, and safety-sensitive topics. You may recommend app actions, but never claim an action was performed; any state-changing action requires explicit confirmation. Current private app context: ${context}`,
        input: [...history, { role: "user", content: [{ type: "input_text", text: message }] }],
        max_output_tokens: 700,
      }),
    });
    if (!response.ok) return Response.json({ error: "AI_SERVICE_ERROR" }, { status: 502 });
    const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const answer = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!answer) return Response.json({ error: "EMPTY_AI_RESPONSE" }, { status: 502 });
    return Response.json({ answer });
  } catch {
    return Response.json({ error: "ASSISTANT_FAILED" }, { status: 500 });
  }
}
