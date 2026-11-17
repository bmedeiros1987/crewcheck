import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

type Binding = {
  bearerToken: string;
};

function readBaseUrl(): string {
  const raw = String(process.env.CREWCHECK_API_BASE_URL || "").trim();
  if (!raw) throw new Error("CREWCHECK_API_BASE_URL is not configured");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("CREWCHECK_API_BASE_URL must use http(s)");
  return url.toString().replace(/\/$/, "");
}

function readBindings(): Record<string, Binding> {
  const raw = String(process.env.CREWCHECK_OPENCLAW_BINDINGS_JSON || "").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, Binding> = {};
  for (const [sender, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const bearerToken = String((value as Record<string, unknown>).bearerToken || "").trim();
    if (sender.trim() && bearerToken) out[sender.trim()] = { bearerToken };
  }
  return out;
}

function resolveBinding(requesterSenderId: unknown): Binding | null {
  const sender = String(requesterSenderId || "").trim();
  if (!sender) return null;
  return readBindings()[sender] || null;
}

async function askCrewCheck(question: string, binding: Binding) {
  const response = await fetch(`${readBaseUrl()}/api/telegram/concierge/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${binding.bearerToken}`,
    },
    body: JSON.stringify({ text: question }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => null) as
    | { ok?: boolean; reply?: string; linked?: boolean; hasRoster?: boolean; message?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      status: response.status,
      message: payload?.message || "CrewCheck Concierge unavailable for this linked account.",
    };
  }

  return {
    ok: true,
    reply: String(payload.reply || "").trim(),
    linked: Boolean(payload.linked),
    hasRoster: Boolean(payload.hasRoster),
  };
}

export default definePluginEntry({
  id: "crewcheck-concierge",
  name: "CrewCheck Concierge",
  description: "Read-only CrewCheck Concierge tools bound to the trusted OpenClaw requester.",
  register(api) {
    api.registerTool(
      (toolContext) => ({
        name: "crewcheck_concierge_read",
        description:
          "Ask the linked CrewCheck Concierge a read-only question about regulation, roster context, hotel/stay, weather or other already-supported Concierge topics. The account is derived from the trusted sender; never ask the model for an email, user ID, workspace ID or token.",
        parameters: Type.Object({
          question: Type.String({ minLength: 1, maxLength: 2000 }),
        }),
        async execute(_toolCallId, params) {
          const binding = resolveBinding(toolContext.requesterSenderId);
          if (!binding) {
            return {
              content: [{
                type: "text",
                text: "CrewCheck account not linked for this sender. Connect this Telegram/WhatsApp identity inside CrewCheck first.",
              }],
              details: { ok: false, linked: false },
            };
          }

          const result = await askCrewCheck(String(params.question || "").trim(), binding);
          return {
            content: [{
              type: "text",
              text: result.ok ? result.reply || "No answer was returned." : result.message,
            }],
            details: result,
          };
        },
      }),
      { name: "crewcheck_concierge_read", optional: true },
    );
  },
});
