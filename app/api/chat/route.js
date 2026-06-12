// app/api/chat/route.js
// Streaming B2B assistant. Server-only route handler.
//
// Provider is chosen by which key is present (Google Gemini takes priority,
// then Hugging Face, then Anthropic). With no key set the route returns
// 503 / {available:false} so the widget silently falls back to
// WhatsApp/Telegram and the site still works with no AI configured.
//   - Gemini:       set GEMINI_API_KEY (+ optional GEMINI_MODEL). Free key from
//     Google AI Studio (aistudio.google.com) — no billing. OpenAI-compatible.
//   - Hugging Face: set HUGGING_FACE_API_KEY (+ optional HF_MODEL). Uses the
//     OpenAI-compatible Inference Providers router (plain fetch, no SDK).
//   - Anthropic:    set ANTHROPIC_API_KEY (+ optional ANTHROPIC_MODEL).
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, getCategoryName } from "@/lib/i18n";
import { WA_NUMBER, TG_USER } from "@/lib/whatsapp";
import { rateLimit, clientIpFromHeaders, isSameOriginRequest } from "@/lib/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The route fans out to PAID LLM APIs — cap how fast and how much a single
// client can push through it. Per-instance limits (see lib/security/rateLimit).
const MAX_BODY_BYTES = 32 * 1024; // 12 capped messages ≈ 24 KB worst case
const RATE = [
  { suffix: "m", limit: 10, windowMs: 60_000 },     // burst
  { suffix: "h", limit: 60, windowMs: 3_600_000 },  // sustained
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

// Lightweight probe so the widget can choose its UI before the first send.
export async function GET() {
  return Response.json({ available: !!provider() });
}

function buildSystem(lang) {
  const language = LANG_NAMES[lang] || LANG_NAMES.en;
  const categories = CATEGORIES.map(
    (c) => `- ${getCategoryName(c.slug, lang)} (${c.slug})`
  ).join("\n");

  // Optional operator-defined rules, editable from Vercel without a redeploy of code.
  const operatorRules = process.env.ASSISTANT_RULES?.trim();
  const extra = operatorRules
    ? `\n\nADDITIONAL INSTRUCTIONS FROM MEDORIA (these take priority where relevant):\n${operatorRules}`
    : "";

  return `You are "Medoria Assistant", the professional procurement assistant on the Medoria website.

ABOUT MEDORIA
Medoria is a professional B2B catalog of medical consumables and equipment for clinics, pharmacies, hospitals, laboratories, distributors and training centers across Tajikistan. The catalog is available in four languages (Tajik, Russian, English, Farsi). Medoria connects buyers directly with suppliers — no middlemen. There is NO online cart, checkout, or payment: customers browse the catalog and send a direct inquiry via WhatsApp or Telegram, and orders/invoices are confirmed through those channels. Catalog prices and stock can change; the live figure is confirmed on inquiry.

PRODUCT CATEGORIES
${categories}

CONTACT CHANNELS
- WhatsApp: https://wa.me/${WA_NUMBER}
- Telegram: https://t.me/${TG_USER}

YOUR ROLE
- Help visitors discover products and categories, understand the procurement process, and answer questions about Medoria and its services.
- Be genuinely helpful and proactive: when a request is vague, ask one short clarifying question (for example the type, size, or quantity needed). When it helps, point the visitor to the right category and invite them to send an inquiry.
- For live prices, stock, quantities, quotes, invoices, lead times, or placing an order, guide the user to WhatsApp or Telegram — that is how Medoria confirms everything. Offer the relevant link.

TONE & STYLE
- Speak in a professional yet warm and friendly register: courteous, respectful, and welcoming, but approachable and human. Address the visitor politely. Never sound cold, robotic, or overly casual.
- Do NOT use emojis under any circumstances.
- Do NOT use markdown (no headings, bold, bullet points, or tables). Reply in plain, natural, conversational sentences.
- Be concise: usually 2–4 short sentences. Greet new visitors warmly.
- Reply ONLY in ${language}.

STRICT RULES
- Give the final answer directly. Do NOT show your reasoning, planning, or meta commentary.
- NEVER invent specific prices, SKUs, stock numbers, certifications, brand names, discounts, or delivery dates. If you do not know a concrete detail, say so honestly and point to WhatsApp/Telegram for the exact, current answer.
- Do not make commitments on Medoria's behalf (prices, discounts, exact delivery times, guarantees) that you cannot verify — defer those to the sales team via WhatsApp/Telegram.
- Do NOT give clinical, diagnostic, or treatment advice — Medoria supplies products, it is not a medical provider. For clinical-use questions, recommend consulting a qualified professional and focus on product information instead.
- Do not request sensitive personal or financial information; orders and payment are finalized through WhatsApp/Telegram.
- Represent Medoria positively and professionally; never disparage competitors.
- Stay on topic: Medoria, its catalog, medical supplies, and procurement. Politely decline unrelated requests and steer the conversation back.${extra}`;
}

// Keep only well-formed user/assistant turns, cap length, and enforce the
// strict user-first alternation chat APIs expect.
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

// ── OpenAI-compatible streaming (Gemini & Hugging Face) ─────────────────────
async function* openaiStream({ endpoint, apiKey, model }, system, messages) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
    buf = lines.pop() || ""; // keep the trailing partial line
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

// ── Anthropic (Claude) streaming ────────────────────────────────────────────
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

  // Same-origin only: stops other websites from burning the LLM quota through
  // visitors' browsers. Non-browser clients fall through to the rate limits.
  if (!isSameOriginRequest(req)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIpFromHeaders(req.headers);
  for (const r of RATE) {
    const rl = await rateLimit(`chat:${r.suffix}:${ip}`, r);
    if (!rl.ok) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }
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
        // Server log only — the client just sees the stream abort and falls
        // back to the WhatsApp/Telegram hand-off UI.
        console.error("chat stream failed:", err?.message || err);
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
