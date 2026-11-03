// lib/operator/userNames.js — the name of a person wherever history shows one (activity log, approvals, requests, warehouse), plus whether
// that person is ARCHIVED, so the screen can put a small "archived" badge next to the name. An archived person keeps their name and id
// everywhere: nothing is renamed, nothing is hidden, nothing points to a different person. Plain module (the client is passed in).
import { tr } from "../panel/i18n.js";

export const ARCHIVED_BADGE = tr("بایگانی‌شده");

// ids → { [id]: { name, archived } }. A read failure returns {} (the screen then shows no name rather than a wrong one).
export async function loadPeople(admin, ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!admin || !list.length) return {};
  const { data, error } = await admin.from("operator_users").select("id,display_name,status").in("id", list);
  if (error) return {};
  return Object.fromEntries((data || []).map((u) => [u.id, { name: u.display_name, archived: u.status === "archived" }]));
}
export const nameOf = (people, id) => people?.[id]?.name || "";
export const isArchived = (people, id) => Boolean(people?.[id]?.archived);
