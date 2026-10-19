import { CatalogNewPage } from "@/components/CatalogPage";

export default async function NewDrinks({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { id } = await params;
  const { mode } = await searchParams;
  return <CatalogNewPage id={id} kind="drink" mode={mode} />;
}
