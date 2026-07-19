// app/api/beauty-chat/route.js
// Streaming B2B assistant for Medoria BEAUTY. Same provider selection,
// streaming, same-origin guard and rate limits as /api/chat, but a
// beauty-specific system prompt (professional beauty catalog for salons,
// boutiques and specialists) built from the Beauty categories.
//   - Gemini:       GEMINI_API_KEY (+ optional GEMINI_MODEL)
//   - Hugging Face: HUGGING_FACE_API_KEY (+ optional HF_MODEL)
//   - Anthropic:    ANTHROPIC_API_KEY (+ optional ANTHROPIC_MODEL)
import Anthropic from "@anthropic-ai/sdk";
import { BEAUTY_CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import { WA_NUMBER, TG_USER } from "@/lib/whatsapp";
import { rateLimit, clientIpFromHeaders, isSameOriginRequest } from "@/lib/security/rateLimit";
import { verifyChatPass } from "@/lib/security/chatPass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const RATE = [
  { suffix: "m", limit: 10, windowMs: 60_000 },
  { suffix: "h", limit: 60, windowMs: 3_600_000 },
];

const HF_ENDPOINT =
  process.env.HF_BASE_URL || "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = process.env.HF_MODEL || "Qwen/Qwen2.5-72B-Instruct";
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const LANG_NAMES = {
  tg: "Tajik (тоҷикӣ)",
  fa: "Persian / Farsi (فارسی)",
  ru: "Russian (русский)",
  en: "English",
};

function provider() {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.HUGGING_FACE_API_KEY) return "hf";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export async function GET() {
  return Response.json({ available: !!provider() });
}

function buildSystem(lang) {
  const language = LANG_NAMES[lang] || LANG_NAMES.en;
  const categories = BEAUTY_CATEGORIES.map(
    (c) => `- ${getCategoryName(c.slug, lang)} (${c.slug})`
  ).join("\n");

  // Optional operator-defined rules (Beauty-specific), editable from Vercel
  // without a code redeploy. Falls back to the shared ASSISTANT_RULES.
  const operatorRules =
    process.env.BEAUTY_ASSISTANT_RULES?.trim() || process.env.ASSISTANT_RULES?.trim();
  const extra = operatorRules
    ? `\n\nADDITIONAL INSTRUCTIONS FROM MEDORIA (these take priority where relevant):\n${operatorRules}`
    : "";

  return `You are "Medoria Beauty Assistant", the professional assistant on the Medoria Beauty website.

ABOUT MEDORIA BEAUTY
Medoria Beauty is a considered, professional B2B catalog of skincare, makeup and beauty tools for salons, studios, boutiques and beauty specialists across Tajikistan. The catalog is available in four languages (Tajik, Russian, English, Farsi). There is NO online cart, checkout, or payment: professionals explore the catalog and send a direct inquiry via WhatsApp or Telegram, and availability, pricing and partnership terms are confirmed through those channels. Catalog prices and availability can change; the current figure is confirmed on inquiry.

PRODUCT CATEGORIES
${categories}

CONTACT CHANNELS
- WhatsApp: https://wa.me/${WA_NUMBER}
- Telegram: https://t.me/${TG_USER}

YOUR ROLE
- Help beauty professionals discover products and categories, understand how to request availability and partnership terms, and answer questions about Medoria Beauty.
- Be genuinely helpful and proactive: when a request is vague, ask one short clarifying question (for example the category, finish, or quantity needed). When it helps, point the visitor to the right category and invite them to send an inquiry.
- For live pricing, availability, quantities, quotes, partnership terms, or placing an order, guide the user to WhatsApp or Telegram — that is how Medoria confirms everything. Offer the relevant link.

TONE & STYLE
- Speak with quiet confidence: professional, warm, considered and modern. Address the visitor politely. Luxury is felt through restraint and specificity, never repeated as a claim. Never sound cold, robotic, or over-eager.
- Do NOT use emojis under any circumstances.
- Do NOT use markdown (no headings, bold, bullet points, or tables). Reply in plain, natural, conversational sentences.
- Be concise: usually 2–4 short sentences. Greet new visitors warmly.
- Reply ONLY in ${language}.

STRICT RULES
- Give the final answer directly. Do NOT show your reasoning, planning, or meta commentary.
- NEVER invent specific prices, SKUs, stock numbers, certifications, brand names, discounts, samples, or delivery dates. If you do not know a concrete detail, say so honestly and point to WhatsApp/Telegram for the exact, current answer.
- Do not use words like authentic, genuine, certified, verified, official, guaranteed, exclusive or best unless Medoria has written evidence — prefer professional, considered and selected.
- Do not make commitments on Medoria's behalf (pricing, discounts, exact delivery times, guarantees) that you cannot verify — defer those to the team via WhatsApp/Telegram.
- Do NOT give medical, dermatological, or treatment advice — Medoria supplies professional products, it is not a medical or clinical provider. For skin-condition or medical questions, recommend consulting a qualified professional and focus on product information instead.
- Do not request sensitive personal or financial information; orders and payment are finalized through WhatsApp/Telegram.
- Represent Medoria positively and professionally; never disparage competitors.
- Stay on topic: Medoria Beauty, its catalog, professional beauty products, and partnership. Politely decline unrelated requests and steer the conversation back.${extra}`;
}

function sanitize(raw) {
  const slice = (Array.isArray(raw) ? raw : []).slice(-12);
  const cleaned = [];
  for (const m of slice) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const content = typeof m.content === "string" ? m.content.trim().slice(0, 2000) : "";
    if (!content) continue;
    cleaned.push({ role: m.role, content });
  }
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  const out = [];
  for (const m of cleaned) {
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  return out;
}

async function* openaiStream({ endpoint, apiKey, model }, system, messages) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: 1024,
      temperature: 0.4,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status} ${detail.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* ignore keep-alive / non-JSON lines */
      }
    }
  }
}

async function* anthropicStream(system, messages) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const events = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    stream: true,
  });
  for await (const event of events) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export async function POST(req) {
  const which = provider();
  if (!which) return Response.json({ unavailable: true }, { status: 503 });

  if (!isSameOriginRequest(req)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIpFromHeaders(req.headers);
  for (const r of RATE) {
    const rl = await rateLimit(`bchat:${r.suffix}:${ip}`, r);
    if (!rl.ok) return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Human gate: only a request carrying a valid chat pass (issued after a
  // solved captcha) may reach the paid model — see /api/chat for rationale.
  if (!verifyChatPass(body?.pass)) {
    return Response.json({ error: "captcha_required" }, { status: 401 });
  }

  const lang = ["tg", "fa", "ru", "en"].includes(body?.lang) ? body.lang : "en";
  const messages = sanitize(body?.messages);
  if (!messages.length) return Response.json({ error: "No messages" }, { status: 400 });

  const system = buildSystem(lang);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen =
          which === "gemini"
            ? openaiStream({ endpoint: GEMINI_ENDPOINT, apiKey: process.env.GEMINI_API_KEY, model: GEMINI_MODEL }, system, messages)
            : which === "hf"
            ? openaiStream({ endpoint: HF_ENDPOINT, apiKey: process.env.HUGGING_FACE_API_KEY, model: HF_MODEL }, system, messages)
            : anthropicStream(system, messages);
        for await (const chunk of gen) controller.enqueue(encoder.encode(chunk));
        controller.close();
      } catch (err) {
        console.error("beauty chat stream failed:", err?.message || err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
