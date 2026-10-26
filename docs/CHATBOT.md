# The website assistant (chat widget)

Both houses have a chat widget (`/api/chat` for Health, `/api/beauty-chat` for Beauty). It is **off** until the server has an AI
key: `GET /api/chat` answers `{"available":false}` and the widget offers only the WhatsApp / Telegram buttons. Nothing else on the
site depends on it.

## Turning it on (owner, on the server)

1. Create a key at <https://aistudio.google.com/apikey> (Google AI Studio). Keep it secret: never paste it into a chat, an issue or a
   commit.
2. In `/home/medoria/apps/medoria-staging/deploy/.env` set `GEMINI_API_KEY=<the key>` (nothing else is needed; leave `GEMINI_MODEL`
   empty). `docker compose` hands the whole file to the app container.
3. Check the file and the key *before* restarting anything:
   ```bash
   cd /home/medoria/apps/medoria-staging
   npm run check:self-host-env -- deploy/.env          # shape of the key, no value printed
   node scripts/check-chat-provider.mjs --file=deploy/.env   # asks Google; prints PASS/FAIL per model, never the key
   ```
   Exit 0 = at least one model answers (the line "The assistant will answer with …" names it). Exit 1 = the key is missing or
   rejected, or no model works. Exit 3 = nothing proven (quota, Google or network error): run it again later.
4. Recreate the app container (`docker compose … up -d app`; follow the runbook), then confirm with `docker compose ps` and
   `curl -s https://medoriaco.com/api/chat` → `{"available":true}`. Then ask the widget a question in the browser: the first answer
   needs the captcha.

## Which model answers

Google retires models on a schedule, and a hard-coded model name stops the assistant without any change on our side.
`gemini-2.0-flash` (the old default) was announced for shutdown on 2026-06-01; the 2.5 models are "legacy" (only keys that used them
before can call them). So `lib/chat/gemini.js` works like this:

- `GEMINI_MODEL` empty: the app tries `gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-2.5-flash` in order.
  A model that Google answers with "not found / retired / not available to this key" is skipped; the one that works is remembered
  until the container restarts. These names are from Google's model list read on 2026-10-26; re-check it when `check-chat-provider`
  shows FAIL for all of them.
- `GEMINI_MODEL=name1,name2`: exactly those, in that order.
- A bad key, quota or an outage is **not** retried on other models (it would only repeat the failure); the widget falls back to the
  WhatsApp / Telegram buttons. A half-sent answer is never restarted on another model.
- Replies are allowed 2048 tokens because newer models spend part of the budget on hidden reasoning; an answer with no text counts
  as a failure of that model.

Provider order when several keys exist: Gemini, then Hugging Face (`HUGGING_FACE_API_KEY`), then Anthropic (`ANTHROPIC_API_KEY`).

## Safety that stays in place

Same-origin only, a signed captcha pass (`CAPTCHA_SECRET`) before the first message, 10 requests a minute / 60 an hour per IP,
32 KB body cap. The key is sent only as an `Authorization` header from the server; it never reaches the browser. The free tier of
Google AI Studio has its own quota: when it is used up the widget quietly shows the WhatsApp / Telegram buttons.
Visitors' messages go to Google when this is on, so mention it in the privacy notice (`docs/PRIVACY_AND_ANALYTICS.md`).

Rules text for the assistant can be changed without a rebuild: `ASSISTANT_RULES` (and `BEAUTY_ASSISTANT_RULES`) in `deploy/.env`.

## What is proven, and what is not

Proven in the repository: the model fallback, error classification, the key check (against a stand-in Google), the env contract,
and the real route in a production build against a stand-in Gemini (first model "retired" → second model answers, stream reaches
the client, wrong origin 403, missing pass 401, key not in the logs). **Not** proven here: that your key works, which model your key
can use, real answer quality in Tajik/Persian/Russian, and anything on the live site. Those need step 3 and a real question on the
server.
