import { CatalogPage } from "@/components/CatalogPage";

export default async function Drinks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CatalogPage id={id} kind="drink" />;
}
