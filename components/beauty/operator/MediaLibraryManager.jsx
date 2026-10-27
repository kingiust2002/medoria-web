"use client";
// Media library of the Beauty panel: the shared MediaLibrary wired to THIS panel's own actions.
import MediaLibrary from "@/components/operator/MediaLibrary";
import { uploadProductImage, deleteMediaFile } from "@/lib/beauty/operator/actions";

const actions = { uploadProductImage, deleteMediaFile };
export default function MediaLibraryManager({ data }) { return <MediaLibrary data={data} actions={actions} />; }
