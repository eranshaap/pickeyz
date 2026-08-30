import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";

export default async function Home() {
  const [cars, listings, dealers] = await Promise.all([
    db.cars.count(),
    db.listings.count(),
    db.dealers.count(),
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{BRAND.name}</h1>
      <p className="text-lg">
        {cars} רכבים · {listings} מודעות · {dealers} מוכרים
      </p>
    </main>
  );
}