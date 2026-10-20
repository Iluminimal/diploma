"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Сүүлчийн арга: layout өөрөө алдаа гарвал root layout-ийг оруулаад бүх хуудсыг орлоно. Тиймээс
 * өөрийн <html> ба <body>-тэй, layout-д байдаг юуг ч ашигладаггүй.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground grid min-h-dvh place-items-center p-6 text-center antialiased">
        <div className="max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            The page could not be shown. Trying again usually fixes it.
          </p>
          <button
            type="button"
            onClick={reset}
            className="bg-primary text-primary-foreground h-11 rounded-full px-6 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
