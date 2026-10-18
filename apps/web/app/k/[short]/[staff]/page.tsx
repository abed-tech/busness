import { kOverview } from "./actions";
import { StaffApp } from "./StaffApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accès du personnel · Cérémonia", robots: { index: false, follow: false } };

export default async function StaffPage({ params }: { params: Promise<{ short: string; staff: string }> }) {
  const { short, staff } = await params;
  const o = await kOverview(short, staff);
  return <StaffApp short={short} staff={staff} initial={o.ok ? o.data! : null} expiredMsg={o.ok ? "" : o.message || ""} />;
}
