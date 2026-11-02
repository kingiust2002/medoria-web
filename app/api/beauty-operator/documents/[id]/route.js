// app/api/beauty-operator/documents/[id]/route.js — a Beauty panel person opens ANY document of their house. Mirror of the Health route.
import { getSession } from "@/lib/beauty/operator/auth";
import { mayView } from "@/lib/operator/access";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { serveDocument, toResponse, notFound } from "@/lib/documentServe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !mayView(session, "beauty", "documents.view")) return toResponse(notFound());
  return toResponse(await serveDocument({ house: "beauty", id, access: "staff", admin: getAdminClient() }));
}
