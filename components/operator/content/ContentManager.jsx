"use client";
// The site-content screen of this panel: the shared ContentPanel wired to THIS panel's own server actions.
import ContentPanel from "@/components/operator/content/ContentPanel";
import { createContent, updateContent, deleteContent } from "@/lib/operator/contentActions";

const actions = { createContent, updateContent, deleteContent };

export default function ContentManager({ data }) {
  return <ContentPanel data={data} actions={actions} house="health" />;
}
