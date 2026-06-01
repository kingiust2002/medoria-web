// app/operator/(panel)/products/[id]/edit/page.jsx
import { notFound } from "next/navigation";
import { getAdminProduct, getAdminCategories } from "@/lib/operator/data";
import ProductForm from "@/components/operator/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }) {
  const [product, categories] = await Promise.all([
    getAdminProduct(params.id),
    getAdminCategories(),
  ]);
  if (!product) notFound();
  return <ProductForm mode="edit" product={product} categories={categories} />;
}
