const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const LANGS = ["fa", "en", "ru", "tg"];

const LANGUAGE_NAMES = {
  fa: "Persian",
  en: "English",
  ru: "Russian",
  tg: "Tajik",
};

function extractJson(text) {
  let value = String(text || "").trim();

  if (value.startsWith("```")) {
    value = value
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");

  if (first !== -1 && last > first) {
    value = value.slice(first, last + 1);
  }

  return JSON.parse(value);
}

export async function translateProductFieldsWithCloudflare({
  source = "fa",
  name = "",
  description = "",
} = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;

  if (!accountId || !token) {
    return {
      ok: false,
      error: "سرویس ترجمه Cloudflare تنظیم نشده است.",
    };
  }

  if (!LANGS.includes(source)) {
    return { ok: false, error: "زبان مبدأ نامعتبر است." };
  }

  const nameText = String(name).trim().slice(0, 300);
  const descText = String(description).trim().slice(0, 5000);

  if (!nameText && !descText) {
    return { ok: false, error: "متنی برای ترجمه وجود ندارد." };
  }

  const targets = LANGS.filter((lang) => lang !== source);

  const expectedShape = Object.fromEntries(
    targets.map((lang) => [
      lang,
      {
        name: "<translated product name>",
        description: "<translated product description>",
      },
    ])
  );

  const systemPrompt = [
    "You are the translation engine for a medical and beauty B2B e-commerce catalog.",
    "Translate accurately and faithfully.",
    "Never add claims, benefits, specifications, warnings, or marketing language that are absent from the source.",
    "Preserve brand names, SKU/model numbers, measurements, units, Latin abbreviations and technical terminology.",
    "For Tajik, use standard Tajik Cyrillic.",
    "Do not explain your translation.",
    "Return ONLY one valid JSON object. No markdown and no code fences.",
    `Source language: ${LANGUAGE_NAMES[source]}.`,
    `Target languages: ${targets.map((x) => LANGUAGE_NAMES[x]).join(", ")}.`,
    `The JSON must have exactly these target keys: ${targets.join(", ")}.`,
    `Required structure example: ${JSON.stringify(expectedShape)}`,
    "If the input name or description is empty, return an empty string for that field.",
  ].join("\n");

  const userPayload = JSON.stringify({
    source,
    target_languages: targets,
    name: nameText,
    description: descText,
  });

  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${accountId}/ai/run/${MODEL}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
        chat_template_kwargs: {
          enable_thinking: false,
        },
        temperature: 0.1,
        max_completion_tokens: 6000,
      }),
      signal: AbortSignal.timeout(60000),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json?.success === false) {
      console.error(
        "cloudflareTranslation",
        response.status,
        Array.isArray(json?.errors)
          ? json.errors.map((e) => e?.code).filter(Boolean)
          : []
      );

      return {
        ok: false,
        error: "سرویس ترجمه در دسترس نیست. دوباره تلاش کنید.",
      };
    }

    const content =
      json?.result?.choices?.[0]?.message?.content;

    if (!content) {
      console.error("cloudflareTranslation empty content");
      return {
        ok: false,
        error: "پاسخ معتبری از سرویس ترجمه دریافت نشد.",
      };
    }

    let parsed;

    try {
      parsed = extractJson(content);
    } catch {
      console.error("cloudflareTranslation invalid JSON");
      return {
        ok: false,
        error: "پاسخ ترجمه قابل پردازش نبود. دوباره تلاش کنید.",
      };
    }

    const translations = {};

    for (const target of targets) {
      const row = parsed?.[target];

      if (!row || typeof row !== "object") {
        return {
          ok: false,
          error: `ترجمه زبان ${target} ناقص دریافت شد.`,
        };
      }

      const translatedName =
        typeof row.name === "string" ? row.name.trim() : "";

      const translatedDescription =
        typeof row.description === "string"
          ? row.description.trim()
          : "";

      if (nameText && !translatedName) {
        return {
          ok: false,
          error: `ترجمه نام محصول برای ${target} ناقص دریافت شد.`,
        };
      }

      if (descText && !translatedDescription) {
        return {
          ok: false,
          error: `ترجمه توضیحات برای ${target} ناقص دریافت شد.`,
        };
      }

      translations[target] = {
        name: nameText ? translatedName : "",
        description: descText ? translatedDescription : "",
      };
    }

    return {
      ok: true,
      source,
      translations,
    };
  } catch (error) {
    console.error(
      "cloudflareTranslation request failed",
      error?.name || "unknown"
    );

    return {
      ok: false,
      error: "ارتباط با سرویس ترجمه برقرار نشد.",
    };
  }
}
