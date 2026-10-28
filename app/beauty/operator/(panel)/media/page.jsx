// app/beauty/operator/(panel)/media/page.jsx — the image library (needs media.view)
import MediaLibraryManager from "@/components/beauty/operator/MediaLibraryManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { getBeautyMediaLibrary } from "@/lib/beauty/operator/data";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await requireBeautySession("media.view");
  return <MediaLibraryManager data={await getBeautyMediaLibrary()} />;
}
