type ChatMessage = { role: "user" | "assistant"; content: string };

type AiProvider =
  | { name: "groq"; apiKey: string; model: string }
  | { name: "openai"; apiKey: string; model: string };

type ProviderFailure = {
  error?: {
    code?: string;
    type?: string;
  };
};

function limitContextValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return undefined;
  if (typeof value === "string") return value.slice(0, 600);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(-12).map((item) => limitContextValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [key, limitContextValue(item, depth + 1)])
        .filter(([, item]) => item !== undefined),
    );
  }
  return undefined;
}

function compactContext(value: unknown, active: string) {
  const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return limitContextValue({
    activeScreen: active,
    profile: state.profile,
    tasks: state.tasks,
    habits: state.habits,
    revisions: state.revisions,
    alarms: state.alarms,
    expenses: state.expenses,
    rewards: state.rewards,
    workouts: state.workouts,
    changeHabits: state.changeHabits,
    checkin: state.checkin,
    recentHistory: Array.isArray(state.history) ? state.history.slice(-5) : [],
  });
}

function getProvider(): AiProvider | null {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    return {
      name: "groq",
      apiKey: groqKey,
      model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return {
      name: "openai",
      apiKey: openAiKey,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
    };
  }

  return null;
}

function mapProviderError(status: number, providerCode?: string) {
  const code = providerCode?.toLowerCase() || "";
  if (status === 401 || code.includes("invalid_api_key")) {
    return { error: "AI_KEY_INVALID", status: 401 };
  }
  if (status === 403) {
    return { error: "AI_ACCESS_DENIED", status: 403 };
  }
  if (status === 429 || code.includes("rate_limit")) {
    return { error: "AI_RATE_LIMITED", status: 429 };
  }
  if (status === 404 || code.includes("model_not_found") || code.includes("model_decommissioned")) {
    return { error: "AI_MODEL_UNAVAILABLE", status: 503 };
  }
  if (status === 400) {
    return { error: "AI_REQUEST_REJECTED", status: 502 };
  }
  return { error: "AI_SERVICE_ERROR", status: 502 };
}

async function readFailure(response: Response) {
  const failure = await response.json().catch(() => null) as ProviderFailure | null;
  return failure?.error?.code || failure?.error?.type;
}

async function askGroq(
  provider: Extract<AiProvider, { name: "groq" }>,
  systemPrompt: string,
  history: ChatMessage[],
  message: string,
) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
      max_completion_tokens: 700,
    }),
  });

  if (!response.ok) {
    const providerCode = await readFailure(response);
    console.error("Quest AI provider request failed", {
      provider: provider.name,
      status: response.status,
      code: providerCode || "unknown",
    });
    return { failure: mapProviderError(response.status, providerCode) };
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return { answer: data.choices?.[0]?.message?.content?.trim() };
}

async function askOpenAi(
  provider: Extract<AiProvider, { name: "openai" }>,
  systemPrompt: string,
  history: ChatMessage[],
  message: string,
) {
  const input = [
    ...history.map((item) => ({
      role: item.role,
      content: [{
        type: item.role === "assistant" ? "output_text" : "input_text",
        text: item.content,
      }],
    })),
    { role: "user", content: [{ type: "input_text", text: message }] },
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      instructions: systemPrompt,
      input,
      max_output_tokens: 700,
    }),
  });

  if (!response.ok) {
    const providerCode = await readFailure(response);
    console.error("Quest AI provider request failed", {
      provider: provider.name,
      status: response.status,
      code: providerCode || "unknown",
    });
    return { failure: mapProviderError(response.status, providerCode) };
  }

  const data = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const answer = data.output_text
    || data.output?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text;
  return { answer: answer?.trim() };
}

export async function POST(request: Request) {
  try {
    const provider = getProvider();
    if (!provider) {
      return Response.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
    }

    const body = await request.json() as {
      message?: string;
      messages?: ChatMessage[];
      state?: unknown;
      active?: string;
    };
    const message = body.message?.trim();
    if (!message) return Response.json({ error: "MESSAGE_REQUIRED" }, { status: 400 });
    if (message.length > 4000) {
      return Response.json({ error: "MESSAGE_TOO_LONG" }, { status: 413 });
    }

    const history = (body.messages || [])
      .filter((item) => item?.role === "user" || item?.role === "assistant")
      .slice(-8)
      .map((item) => ({ role: item.role, content: item.content.slice(0, 2000) }));
    const context = JSON.stringify(compactContext(body.state, body.active || "overview"));
    const systemPrompt = `You are Quest AI, the digital brain inside LifeQuest 90. Generate every answer from the user's query and supplied context; never use canned replies. Answer questions across study, productivity, habits, fitness, budgeting, planning, technology, general knowledge, and the LifeQuest app. Use the private app context only when it helps. Never invent progress or facts that are absent. Reply in the user's language (Hindi, Hinglish, or English), keep advice practical, and ask one focused follow-up only when essential. Be cautious with medical, financial, and safety-sensitive topics. You may recommend app actions, but never claim an action was performed. Current private app context: ${context}`;

    const result = provider.name === "groq"
      ? await askGroq(provider, systemPrompt, history, message)
      : await askOpenAi(provider, systemPrompt, history, message);

    if (result.failure) {
      return Response.json(
        { error: result.failure.error },
        { status: result.failure.status },
      );
    }
    if (!result.answer) {
      return Response.json({ error: "EMPTY_AI_RESPONSE" }, { status: 502 });
    }

    return Response.json({ answer: result.answer, provider: provider.name });
  } catch (error) {
    console.error("Quest AI request failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "ASSISTANT_FAILED" }, { status: 500 });
  }
}
