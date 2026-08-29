import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";

export default async function Home() {
  const rows = await db.health_check.findMany({
    orderBy: { created_at: "desc" },
    take: 1,
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{BRAND.name}</h1>
      <p className="text-lg">{rows[0]?.message ?? "no rows found"}</p>
    </main>
  );
}