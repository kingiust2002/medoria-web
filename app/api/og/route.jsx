// app/api/og/route.jsx — dynamic Open Graph image (1200x630) for rich link
// previews on WhatsApp/Telegram/LinkedIn/Google. Lives under /api so the i18n
// middleware doesn't rewrite it. English only (Farsi is dropped from the site).
import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || "Medical consumables & supplies").slice(0, 110);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: 72, color: "white", fontFamily: "sans-serif",
          background: "linear-gradient(135deg,#070A14 0%,#141036 45%,#0A1E45 76%,#06243B 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>Medoria</div>
          <div
            style={{
              fontSize: 20, fontWeight: 700, color: "#0a0f24", padding: "6px 14px",
              borderRadius: 999, background: "#22D3EE",
            }}
          >
            B2B Medical
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.08, maxWidth: 980 }}>{title}</div>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.72)", marginTop: 26 }}>
            Tajikistan · Dushanbe · direct supply via WhatsApp &amp; Telegram
          </div>
        </div>

        <div style={{ display: "flex" }}>
          <div style={{ height: 10, width: 280, borderRadius: 10, background: "linear-gradient(90deg,#F0289E,#A634E8,#3B82F6,#22D3EE)" }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
