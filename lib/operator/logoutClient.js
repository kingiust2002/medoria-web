
import { tr } from "../panel/i18n.js";
// lib/operator/logoutClient.js — the browser side of "log out" for both panels (plain, no React).
// A logout counts only when the SERVER confirms it ended the session: HTTP 2xx and { ok: true }. Anything else
// (a 503 because revocation failed, a network error, a gateway page) is a failure the user is told about, and the
// panel stays open so they can retry: a "logged out" screen over a session that is still alive would be a lie.

export const LOGOUT_NETWORK_ERROR = tr("خروج انجام نشد: ارتباط با سرور برقرار نشد. دوباره تلاش کنید؛ تا آن زمان این مرورگر همچنان وارد است.");
export const LOGOUT_GENERIC_ERROR = tr("خروج کامل انجام نشد. دوباره تلاش کنید؛ تا آن زمان این مرورگر همچنان وارد است.");

// → { ok: true } | { ok: false, message }
export async function requestLogout(endpoint, fetchImpl = globalThis.fetch) {
  let res;
  try { res = await fetchImpl(endpoint, { method: "POST" }); } catch { return { ok: false, message: LOGOUT_NETWORK_ERROR }; }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (res.ok && body && body.ok === true) return { ok: true };
  const message = body && typeof body.error === "string" && body.error.length < 300 ? body.error : LOGOUT_GENERIC_ERROR;
  return { ok: false, message };
}
