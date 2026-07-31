import { notFound, redirect } from "next/navigation";
import { getCategories } from "@/lib/supabase";
import { buildHealthCategoryTree, findHealthCategory } from "@/lib/health/categories";

export const dynamic = "force-dynamic";

export default async function HealthCategoryPage(props) {
  const { lang, slug } = await props.params;
  const categories = await getCategories();
  const tree = buildHealthCategoryTree(categories, { activeOnly: true });
  const category = findHealthCategory(tree, slug);

  if (!category) notFound();

  if (!category.children?.length) {
    redirect(`/health/${lang}/catalog?category=${category.slug}`);
  }

  redirect(`/health/${lang}/categories#${category.slug}`);
}
