// app/api/chat/route.js
// Streaming B2B assistant powered by Claude. Server-only route handler.
//
// Graceful degradation: when ANTHROPIC_API_KEY is not set the POST returns
// 503 {unavailable:true} and GET reports {available:false}, so the widget
// silently falls back to WhatsApp/Telegram and the site still works with no
// key configured. Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) to
// enable the smart assistant.
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, getCategoryName } from "@/lib/i18n";
import { WA_NUMBER, TG_USER } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Defaults to the most capable model; an operator can pick a cheaper model
// (e.g. claude-haiku-4-5) for a high-traffic public chat via ANTHROPIC_MODEL.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const LANG_NAMES = {
  tg: "Tajik (тоҷикӣ)",
  fa: "Persian / Farsi (فارسی)",
  ru: "Russian (русский)",
  en: "English",
};

// Lightweight probe so the widget can choose its UI before the first send.
export async function GET() {
  return Response.json({ available: !!process.env.ANTHROPIC_API_KEY });
}

function buildSystem(lang) {
  const language = LANG_NAMES[lang] || LANG_NAMES.en;
  const categories = CATEGORIES.map(
    (c) => `- ${getCategoryName(c.slug, lang)} (${c.slug})`
  ).join("\n");

  return `You are "Medoria Assistant", the helpful B2B assistant on the Medoria website.

ABOUT MEDORIA
Medoria is a professional B2B catalog of medical consumables and equipment for clinics, pharmacies, hospitals, laboratories, distributors and training centers across Tajikistan. The catalog is available in four languages (Tajik, Russian, English, Farsi). Medoria connects buyers directly with suppliers — no middlemen. There is NO online cart, checkout, or payment: customers browse the catalog and send a direct inquiry via WhatsApp or Telegram, and orders/invoices are confirmed through those channels. Catalog prices and stock can change; the live figure is confirmed on inquiry.

PRODUCT CATEGORIES
${categories}

CONTACT CHANNELS
- WhatsApp: https://wa.me/${WA_NUMBER}
- Telegram: https://t.me/${TG_USER}

YOUR ROLE
- Help visitors discover products and categories, understand the procurement process, and answer questions about Medoria and its services.
- For live prices, stock, quantities, quotes, invoices, lead times, or placing an order, direct the user to WhatsApp or Telegram — that is how Medoria confirms everything. Offer the relevant link.
- Behave like a knowledgeable, professional procurement assistant: concise and practical.

STRICT RULES
- Reply ONLY in ${language}. Keep a professional, friendly register.
- Be concise: usually 2–5 short sentences. Use a short bullet list only when it genuinely helps. Plain text only — no markdown headings or tables.
- Give the final answer directly. Do NOT show your reasoning, planning, or meta commentary.
- NEVER invent specific prices, SKUs, stock numbers, certifications, brand names, or delivery dates. If you don't know a concrete detail, say so plainly and point to WhatsApp/Telegram for the exact, current answer.
- Do NOT give clinical, diagnostic, or treatment advice — Medoria supplies products, it is not a medical provider. For clinical-use questions, recommend consulting a qualified professional and focus on product information instead.
- Stay on topic: Medoria, its catalog, medical supplies, and procurement. Politely decline unrelated requests and steer back.`;
}

// Keep only well-formed user/assistant turns, cap length, and enforce the
// strict user-first alternation the Messages API requires.
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

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ unavailable: true }, { status: 503 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const lang = ["tg", "fa", "ru", "en"].includes(body?.lang) ? body.lang : "en";
  const messages = sanitize(body?.messages);
  if (!messages.length) return Response.json({ error: "No messages" }, { status: 400 });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const events = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: [
            { type: "text", text: buildSystem(lang), cache_control: { type: "ephemeral" } },
          ],
          messages,
          stream: true,
        });
        for await (const event of events) {
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
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
