import { CatalogPage } from "@/components/CatalogPage";

export default async function Buffet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q } = await searchParams;
  return <CatalogPage id={id} kind="dish" q={q} />;
}
