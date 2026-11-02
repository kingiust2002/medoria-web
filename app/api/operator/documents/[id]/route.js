// app/api/operator/documents/[id]/route.js — a Health panel person opens ANY document of their house (draft, hidden, expired). Session and the right to
// see documents are checked here, before the database is touched; the Beauty table is not reachable through this route.
import { getSession } from "@/lib/operator/auth";
import { mayView } from "@/lib/operator/access";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { serveDocument, toResponse, notFound } from "@/lib/documentServe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !mayView(session, "health", "documents.view")) return toResponse(notFound());
  return toResponse(await serveDocument({ house: "health", id, access: "staff", admin: getAdminClient() }));
}
