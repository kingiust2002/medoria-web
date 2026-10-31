// app/operator/(panel)/products/[id]/edit/page.jsx
import { notFound, redirect } from "next/navigation";
import { getAdminProduct, getAdminCategories, getAdminVariants } from "@/lib/operator/data";
import ProductForm from "@/components/operator/ProductForm";
import VariantsManager from "@/components/operator/VariantsManager";
import ImageUploader from "@/components/operator/ImageUploader";
import { saveVariant, deleteProduct } from "@/lib/operator/actions";
import { requireHealthSession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function EditProductPage(props) {
  await requireHealthSession("products.view");
  const params = await props.params;
  const [product, categories] = await Promise.all([
    getAdminProduct(params.id),
    getAdminCategories(),
  ]);
  if (!product) notFound();
  // a variant is edited from its product's page (migration 44)
  if (product.variant_of != null) redirect(`/operator/products/${product.variant_of}/edit`);
  const variants = await getAdminVariants(product.id);
  return (
    <>
      <ProductForm mode="edit" product={product} categories={categories} />
      {!variants.hidden && (
        <div className="mt-6 max-w-5xl">
          <VariantsManager house="health" parent={product} variants={variants.variants} unavailable={variants.unavailable}
            save={saveVariant} remove={deleteProduct} Uploader={ImageUploader} approvalsHref="/operator/approvals" />
        </div>
      )}
    </>
  );
}
