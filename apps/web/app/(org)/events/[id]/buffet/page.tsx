import { CatalogPage } from "@/components/CatalogPage";

export default async function Buffet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CatalogPage id={id} kind="dish" />;
}
