// app/beauty/operator/(panel)/products/[id]/edit/page.jsx
import { notFound } from "next/navigation";
import { getAdminBeautyProduct, getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductForm from "@/components/beauty/operator/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }) {
  const [product, categories] = await Promise.all([
    getAdminBeautyProduct(params.id),
    getAdminBeautyCategories(),
  ]);
  if (!product) notFound();
  return <ProductForm mode="edit" product={product} categories={categories} />;
}
