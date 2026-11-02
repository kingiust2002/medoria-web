// app/beauty/operator/(panel)/products/[id]/edit/page.jsx
import DocumentsManager from "@/components/operator/DocumentsManager";
import { addProductDocument, updateProductDocument, setProductDocumentPublished, deleteProductDocument } from "@/lib/beauty/operator/documentActions";
import { listDocuments } from "@/lib/operator/documentsCore";
import { readRules } from "@/lib/operator/publishGate";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { notFound, redirect } from "next/navigation";
import { getAdminBeautyProduct, getAdminBeautyCategories, getAdminBeautyVariants } from "@/lib/beauty/operator/data";
import ProductForm from "@/components/beauty/operator/ProductForm";
import VariantsManager from "@/components/operator/VariantsManager";
import ImageUploader from "@/components/beauty/operator/ImageUploader";
import { saveVariant, deleteProduct } from "@/lib/beauty/operator/actions";
import { requireBeautySession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function EditProductPage(props) {
  await requireBeautySession("products.view");
  const params = await props.params;
  const rules = await readRules(getAdminClient(), "beauty");
  const [product, categories] = await Promise.all([
    getAdminBeautyProduct(params.id),
    getAdminBeautyCategories(),
  ]);
  if (!product) notFound();
  // a variant is edited from its product's page (migration 44)
  if (product.variant_of != null) redirect(`/beauty/operator/products/${product.variant_of}/edit`);
  const docs = await listDocuments(getAdminClient(), "beauty", product.id);
  const variants = await getAdminBeautyVariants(product.id);
  return (
    <>
      <ProductForm mode="edit" product={product} categories={categories} publishRules={rules.state === "ok" ? rules.rules : []} publishRulesUnavailable={rules.state === "error"} />
      {!variants.hidden && (
        <div className="mt-6 max-w-5xl">
          <VariantsManager house="beauty" parent={product} variants={variants.variants} unavailable={variants.unavailable}
            save={saveVariant} remove={deleteProduct} Uploader={ImageUploader} approvalsHref="/beauty/operator/approvals" />
        </div>
      )}
      <div className="mt-6 max-w-5xl">
        <DocumentsManager house="beauty" productId={product.id} documents={docs.rows} unavailable={Boolean(docs.unavailable)}
          actions={{ add: addProductDocument, update: updateProductDocument, publish: setProductDocumentPublished, remove: deleteProductDocument }} approvalsHref="/beauty/operator/approvals" />
      </div>
    </>
  );
}
