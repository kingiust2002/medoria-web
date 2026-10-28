"use client";
// Product history of the Health panel: the shared ProductHistory wired to THIS panel's own revert action.
import ProductHistory from "@/components/operator/ProductHistory";
import { restoreProductVersion } from "@/lib/operator/actions";

const actions = { restoreProductVersion };
export default function ProductHistoryManager(props) {
  return <ProductHistory {...props} actions={actions} base="/operator/products" />;
}
