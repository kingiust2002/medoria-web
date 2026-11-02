// app/api/documents/[house]/[id]/route.js — the public door to a product document (review R1). The file is in a private bucket; this route serves it
// only while the database says the document is public right now (published, not expired, active parent, not a variant). Same 404 for everything else.
import { supabase } from "@/lib/supabase";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { DOC_HOUSES, serveDocument, toResponse } from "@/lib/documentServe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// the anonymous client asks the database function (a POST, so no cache layer can answer for it)
const isVisible = async (house, id) => {
  const { data, error } = await supabase.rpc(DOC_HOUSES[house].visible, { p_id: id });
  return !error && data === true;
};

export async function GET(_req, { params }) {
  const { house, id } = await params;
  return toResponse(await serveDocument({ house, id, access: "public", isVisible, admin: getAdminClient() }));
}
