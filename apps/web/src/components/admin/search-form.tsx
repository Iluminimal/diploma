"use client";

import { Search } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Жагсаалтын хайлтын мөр (Apple-ийн pill хэлбэртэй хайлт). `q` нь URL-д орох тул `onSearch` дуудагч
 * `router.replace` хийнэ. `key={defaultValue}`: URL-ээс ирсэн шинэ утга бичсэнийг орлоно.
 */
export function SearchForm({
  label,
  placeholder,
  defaultValue,
  buttonLabel,
  onSearch,
  className,
}: {
  label: string;
  placeholder: string;
  defaultValue: string;
  buttonLabel: string;
  onSearch: (q: string) => void;
  className?: string;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(String(new FormData(event.currentTarget).get("q") ?? "").trim());
  };
  return (
    <form onSubmit={submit} role="search" aria-label={label} className={className ?? "flex w-full gap-2 sm:w-auto"}>
      <div className="relative flex-1 sm:w-96">
        <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <Input
          key={defaultValue}
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={placeholder}
          className="bg-background h-10 rounded-full pl-10"
        />
      </div>
      <Button type="submit" variant="outline" className="h-10 rounded-full px-4">
        {buttonLabel}
      </Button>
    </form>
  );
}
