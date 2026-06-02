import { Dashboard } from "@/components/dashboard";
import { getStats, listContexts } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, contexts] = await Promise.all([getStats(), listContexts()]);
  return <Dashboard initialStats={stats} initialContexts={contexts} />;
}
