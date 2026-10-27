// app/operator/(panel)/media/page.jsx — the image library (needs media.view)
import MediaLibraryManager from "@/components/operator/MediaLibraryManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { getMediaLibrary } from "@/lib/operator/data";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await requireHealthSession("media.view");
  return <MediaLibraryManager data={await getMediaLibrary()} />;
}
