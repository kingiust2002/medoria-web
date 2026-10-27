// lib/operator/schedule.js — the dates of scheduled publishing: how a person types them (the team's local time, Tajikistan UTC+5), how
// they are stored (UTC instants), and the checks. Plain module (no Next imports, usable in the browser): unit-tested.
import { tr } from "../panel/i18n.js";

export const TEAM_OFFSET_MIN = 5 * 60;
export const SCHEDULE_FIELDS = ["publish_at", "unpublish_at"];

export const SCHEDULE_MESSAGES = {
  bad: tr("زمان‌بندی معتبر نیست."),
  past: tr("زمان انتشار یا آرشیو خودکار باید در آینده باشد."),
  far: tr("زمان‌بندی حداکثر دو سال جلوتر ممکن است."),
  order: tr("زمان آرشیو خودکار باید بعد از زمان انتشار خودکار باشد."),
};

// "2026-10-30T09:30" typed in the team's time → ISO instant (UTC); "" / null → null; garbage → undefined
export function localToIso(value) {
  if (value == null || value === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value));
  if (!m) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - TEAM_OFFSET_MIN * 60_000;
  const back = new Date(ms + TEAM_OFFSET_MIN * 60_000);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) return undefined;   // 31 February, 25:00
  return new Date(ms).toISOString();
}

// ISO instant → "2026-10-30T09:30" in the team's time (for <input type="datetime-local">); "" when empty
export function isoToLocal(iso) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return "";
  return new Date(t + TEAM_OFFSET_MIN * 60_000).toISOString().slice(0, 16);
}

export const sameInstant = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Date.parse(a) === Date.parse(b);
};

// What the server accepts for one product: both values are instants or null, a changed value lies in the future (at most two years
// ahead), and archiving comes after publishing. `before` is the stored product (an unchanged value is never re-judged: a schedule that
// is due but not yet applied can be saved again). → { ok: true, values } | { ok: false, error }
export function checkSchedule(input, before = null, now = Date.now()) {
  const values = {};
  for (const f of SCHEDULE_FIELDS) {
    if (!(f in input)) continue;
    const raw = input[f];
    const iso = raw == null || raw === "" ? null : (Number.isNaN(Date.parse(raw)) ? undefined : new Date(raw).toISOString());
    if (iso === undefined) return { ok: false, error: SCHEDULE_MESSAGES.bad };
    if (iso && !sameInstant(iso, before?.[f])) {
      if (Date.parse(iso) <= now) return { ok: false, error: SCHEDULE_MESSAGES.past };
      if (Date.parse(iso) > now + 2 * 366 * 86_400_000) return { ok: false, error: SCHEDULE_MESSAGES.far };
    }
    values[f] = iso;
  }
  const pub = "publish_at" in values ? values.publish_at : before?.publish_at, unpub = "unpublish_at" in values ? values.unpublish_at : before?.unpublish_at;
  if (pub && unpub && Date.parse(unpub) <= Date.parse(pub)) return { ok: false, error: SCHEDULE_MESSAGES.order };
  return { ok: true, values };
}

// The schedule fields to WRITE: only values that differ from the stored product (none at all for a form that leaves the schedule
// alone — so saving works on a database that has not applied migration 39 yet).
export function scheduleChanges(values, before = null) {
  const out = {};
  for (const f of SCHEDULE_FIELDS) if (f in values && !sameInstant(values[f], before?.[f])) out[f] = values[f];
  return out;
}
