"use client";
// Media library of the Health panel: the shared MediaLibrary wired to THIS panel's own actions.
import MediaLibrary from "@/components/operator/MediaLibrary";
import { uploadProductImage, deleteMediaFile } from "@/lib/operator/actions";

const actions = { uploadProductImage, deleteMediaFile };
export default function MediaLibraryManager({ data }) { return <MediaLibrary data={data} actions={actions} />; }
