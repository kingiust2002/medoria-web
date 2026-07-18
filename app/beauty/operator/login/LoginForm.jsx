"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { BeautyWordLockup } from "@/components/beauty/BeautyBrand";
import { Spinner } from "@/components/operator/ui";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/beauty-operator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/beauty/operator");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "ورود ناموفق بود.");
    } catch {
      setError("ارتباط برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen grid place-items-center p-4 dark:bg-canvas"
      style={{ background: "linear-gradient(160deg,#FBF6EE 0%,#F6E9DB 55%,#EFD9C4 100%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-4 mb-7 text-center">
          <span className="inline-flex items-center rounded-full bg-white/95 px-4 py-2 shadow-soft ring-1 ring-black/5">
            <BeautyWordLockup height={30} />
          </span>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="grid place-items-center w-7 h-7 rounded-full text-white"
              style={{ background: "linear-gradient(135deg,#0E1947,#B87D4E)" }}>
              <Icon name="lock" size={14} />
            </span>
            ورود به پنل بیوتی
          </div>
        </div>

        <form onSubmit={submit} className="card p-6 flex flex-col gap-4">
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">نام کاربری</span>
            <input
              type="text"
              name="username"
              dir="ltr"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input w-full"
              placeholder="username"
            />
          </label>

          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">رمز عبور</span>
            <input
              type="password"
              name="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 text-[13px] text-warn bg-warn/10 rounded-xl px-3 py-2.5">
              <Icon name="alertTriangle" size={16} />
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !username || !password} className="btn-primary size-lg w-full disabled:opacity-60">
            {loading ? <Spinner /> : <Icon name="arrowL" size={18} />}
            {loading ? "در حال ورود…" : "ورود"}
          </button>
        </form>

        <p className="text-center text-[11px] text-ink-faint mt-5 leading-relaxed">
          این پنل کاملاً جدا از پنل Health است. دسترسی فقط برای کارکنان مجاز.
        </p>
      </div>
    </div>
  );
}
