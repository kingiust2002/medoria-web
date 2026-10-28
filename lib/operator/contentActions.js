"use server";
// lib/operator/contentActions.js — Health panel: the site-content server actions (banner and FAQ). Session first (this panel's own), then the shared work in
// lib/content/actionsCore.js, which asks the permission of each operation at the moment of use.
import { getSession } from "@/lib/operator/auth";
import { contentCtx } from "@/lib/content/panelCtx";
import * as core from "@/lib/content/actionsCore";

const ctxFor = () => contentCtx("health", getSession);

export async function createContent(kind, input) {
  const a = await ctxFor();
  return a.ok ? core.createContent(a.ctx, kind, input) : a;
}

export async function updateContent(id, input, expectedVersion) {
  const a = await ctxFor();
  return a.ok ? core.updateContent(a.ctx, id, input, expectedVersion) : a;
}

export async function deleteContent(id, expectedVersion) {
  const a = await ctxFor();
  return a.ok ? core.deleteContent(a.ctx, id, expectedVersion) : a;
}
