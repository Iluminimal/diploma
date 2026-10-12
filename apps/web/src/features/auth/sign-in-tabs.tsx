"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CodeSignIn } from "./code-sign-in";
import { LoginForm } from "./login-form";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";

type Method = "phone" | "email";
const METHODS: { id: Method; label: string }[] = [
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
];

/** Phone or email, as two tabs with a sliding thumb. Email also has a password and a code option. */
export function SignInTabs({ next, initial = "phone" }: { next: string; initial?: Method }) {
  const [method, setMethod] = useState<Method>(initial);
  const [emailMode, setEmailMode] = useState<"password" | "code">("password");
  const [naming, setNaming] = useState(false);
  useRedirectWhenSignedIn(next, !naming);
  const active = METHODS.findIndex((item) => item.id === method);

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="How to sign in"
        className="bg-secondary relative grid grid-cols-2 rounded-full p-1"
      >
        <span
          aria-hidden
          className="bg-background absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full shadow-sm transition-transform duration-300 ease-out-expo"
          style={{ transform: `translateX(${active * 100}%)` }}
        />
        {METHODS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`signin-tab-${id}`}
            aria-selected={method === id}
            aria-controls={`signin-panel-${id}`}
            onClick={() => setMethod(id)}
            className={cn(
              "focus-visible:ring-ring/60 relative z-10 h-9 rounded-full text-sm font-medium outline-none transition-colors focus-visible:ring-3",
              method === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="signin-panel-phone" aria-labelledby="signin-tab-phone" hidden={method !== "phone"}>
        {method === "phone" && <CodeSignIn kind="phone" next={next} onNaming={setNaming} />}
      </div>
      <div role="tabpanel" id="signin-panel-email" aria-labelledby="signin-tab-email" hidden={method !== "email"}>
        {method === "email" &&
          (emailMode === "password" ? (
            <div className="space-y-4">
              <LoginForm next={next} />
              <button
                type="button"
                onClick={() => setEmailMode("code")}
                className="text-muted-foreground hover:text-foreground mx-auto block text-sm underline underline-offset-4"
              >
                Email me a code instead
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <CodeSignIn kind="email" next={next} onNaming={setNaming} />
              <button
                type="button"
                onClick={() => setEmailMode("password")}
                className="text-muted-foreground hover:text-foreground mx-auto block text-sm underline underline-offset-4"
              >
                Use a password instead
              </button>
            </div>
          ))}
      </div>
      <p className="text-muted-foreground text-center text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
