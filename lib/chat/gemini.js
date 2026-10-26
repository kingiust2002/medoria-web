// lib/chat/gemini.js — which Gemini model the assistant uses, and what to do when Google no longer serves it.
//
// Google retires models on a schedule (gemini-2.0-flash was announced for shutdown on 2026-06-01, and the 2.5 models
// are "legacy": only keys that used them before can still call them). A hard-coded default therefore stops the
// assistant without any change on our side. Two defences:
//   * GEMINI_MODEL (one name, or several separated by commas) is the owner's explicit choice and is tried in order;
//   * without it, a short list of current Flash models is tried, and a model Google reports as unknown / retired /
//     not available to this key is skipped for the next one. The model that worked is remembered per process.
// Anything else (bad key, quota, outage) is NOT a reason to try another model and surfaces as the error it is.

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// GEMINI_BASE_URL exists so tests can point the assistant at a stand-in server; production leaves it unset
// (scripts/check-self-host-env.mjs warns when it is set).
export function geminiBase(env = process.env) {
  return String(env.GEMINI_BASE_URL || GEMINI_BASE).replace(/\/+$/, "");
}
export const geminiChatEndpoint = (env = process.env) => `${geminiBase(env)}/openai/chat/completions`;

// Fast, inexpensive models first; checked against Google's model list on 2026-10-26 (docs/CHATBOT.md).
export const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];

export function geminiModels(env = process.env) {
  const given = String(env.GEMINI_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
  return given.length ? given : DEFAULT_GEMINI_MODELS;
}

// An error that says "this model cannot be used" rather than "this request failed".
export function isModelUnavailable(err) {
  const status = Number(err?.status || 0);
  const text = String(err?.detail || err?.message || "");
  if (status === 404) return true;
  if (status === 400 || status === 403) {
    return /model/i.test(text) && /(not found|not supported|no longer|deprecat|unavailable|not available|does not exist|retired|discontinued|permission)/i.test(text);
  }
  return false;
}

let working = null; // model that answered last in this process

export function resetGeminiMemory() { working = null; }

// makeStream(model) -> async iterable of text chunks. Yields the chunks of the first model that produces text.
// Falls through to the next model only when nothing has been yielded yet (a half-sent answer is never restarted).
export async function* streamWithModelFallback(models, makeStream, { log = () => {} } = {}) {
  const order = working && models.includes(working) ? [working, ...models.filter((m) => m !== working)] : models;
  let lastError = null;
  for (const model of order) {
    let yielded = false;
    try {
      for await (const chunk of makeStream(model)) {
        yielded = true;
        yield chunk;
      }
      if (yielded) { working = model; return; }
      lastError = new Error(`model ${model} returned no text`);   // e.g. all of the budget spent on hidden reasoning
      log(`chat: ${lastError.message}; trying the next model`);
    } catch (err) {
      if (yielded || !isModelUnavailable(err)) throw err;
      lastError = err;
      log(`chat: model ${model} is not available (${err.status || "?"}); trying the next model`);
    }
  }
  throw lastError || new Error("no Gemini model configured");
}
