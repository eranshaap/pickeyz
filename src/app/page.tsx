import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">{BRAND.name}</h1>
    </main>
  );
}