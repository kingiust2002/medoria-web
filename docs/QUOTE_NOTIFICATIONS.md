# New-inquiry notifications (Telegram)

Every customer inquiry is stored in `quote_requests` (Health) or
`beauty_quote_requests` (Beauty) and appears in the operator panel, but nobody is
told. With this feature each new inquiry also posts a short notice to a **private
Telegram group**, so the team sees it within seconds and the group is a second copy
of the lead (the daily backup is up to 24 h old).

It is **off by default**: nothing is sent until both variables below are set.

## What is sent

```text
Medoria Health: new inquiry #12
Name: <name>
Organization: <organization>
Product: <product> (<SKU>) x <quantity>
Prefers: whatsapp (tg)
Open: https://medoriaco.com/operator/quotes
```

Beauty inquiries say `Medoria Beauty` and link to `/beauty/operator/quotes`.
**The phone number and the message text are not included** unless you set
`TELEGRAM_INCLUDE_DETAILS=true`. The notice is plain text (no markup), and every
visitor-typed field is trimmed and length-capped.

The name and organization a visitor types do leave the server and reach Telegram's
servers: keep the group private, limit it to the people who answer inquiries, and
decide consciously about `TELEGRAM_INCLUDE_DETAILS`.

## Failure behaviour

The inquiry is saved first. The notice is sent afterwards with a 2.5 s timeout and
can never fail or slow the form for the visitor: if Telegram is unreachable or
rejects the request, the server log gets one line (`telegram notice failed: HTTP 401`
or `... TimeoutError`; never the token or the message) and the visitor still sees
success.

## Setup

1. In Telegram, open **@BotFather**, send `/newbot`, pick a name and copy the bot
   token (`123456789:AA...`). Treat it like a password.
2. Create a **private group** with the people who answer inquiries and add the bot
   to it (a bot cannot read a group's history; it only needs to post).
3. Get the group's chat id: send any message in the group, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read
   `"chat":{"id":-100…}` (groups are negative). Do not paste the token anywhere
   shared.
4. On the VPS add to `deploy/.env` (mode `600`, never committed):

   ```text
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_CHAT_ID=<chat id>
   TELEGRAM_INCLUDE_DETAILS=
   ```

5. Validate and apply (the container reads `deploy/.env` only when it is created):

   ```bash
   cd /home/medoria/apps/medoria-staging
   npm run check:self-host-env -- deploy/.env          # both-or-neither and format checks
   docker compose --env-file deploy/.env -f deploy/compose.app.yml up -d app
   docker compose --env-file deploy/.env -f deploy/compose.app.yml ps   # app must be healthy
   ```

6. Test: submit one clearly named inquiry from `/health/en/contact` and one from
   `/beauty/en/contact`; both notices must arrive in the group. Then delete the two
   rows in the panel (Quotes).

## Turn it off or roll back

Empty both variables in `deploy/.env` and recreate the app container (same
`up -d app`). To revoke the bot completely, use `/revoke` in @BotFather.

## Not included (on purpose)

An e-mail channel (needs a transactional-mail provider and SPF/DKIM records), per-person
assignment, and follow-up reminders: add them when the team is larger than the
current one or two people.
