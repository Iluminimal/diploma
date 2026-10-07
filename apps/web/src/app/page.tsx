import { ApiStatus } from "@/features/health/api-status";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-lg font-semibold tracking-tight">Lookalike</span>
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-6 px-4 pb-24">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Find clothing that looks like the photo you have.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg">
          Visual search for fashion is on its way. The foundation is up: web,
          API, database and vector search infrastructure.
        </p>
        <ApiStatus />
      </main>
    </div>
  );
}
