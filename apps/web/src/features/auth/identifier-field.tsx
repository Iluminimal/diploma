"use client";

import type { CountryCode } from "libphonenumber-js/min";
import { FloatingLabel, floatingInputClass } from "@/components/forms/floating-label";
import { cn } from "@/lib/utils";
import { CountrySelect } from "./phone-input";

/**
 * Нэвтрэх хуудасны цорын ганц талбар: имэйл эсвэл утасны дугаар. Талбарт юм бичмэгц label дээш
 * хөвнө. Утасны дугаар бол талбар дотор улс сонгогч гарна.
 */
export function IdentifierField({
  value,
  onChange,
  phone,
  region,
  onRegionChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Текст утасны дугаар: улс сонгогчийг харуулна. */
  phone: boolean;
  region: CountryCode;
  onRegionChange: (region: CountryCode) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <div className={cn("group relative", error && "animate-shake")}>
        {phone && (
          <CountrySelect
            value={region}
            onChange={onRegionChange}
            className="text-foreground focus-visible:ring-ring/50 absolute top-2 bottom-2 left-2 z-10 w-[6.5rem] rounded-lg bg-transparent px-2 text-base outline-none focus-visible:ring-3"
          />
        )}
        <input
          id="identifier"
          name="identifier"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          // "username webauthn" нь password manager болон passkey-д энд өөрсдийгөө санал болгох
          // боломж өгнө.
          autoComplete="username webauthn"
          inputMode={phone ? "tel" : "email"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          placeholder=" "
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "identifier-error" : undefined}
          className={cn(floatingInputClass, phone && "pl-[7.75rem]")}
        />
        <FloatingLabel htmlFor="identifier" className={phone ? "left-[7.75rem]" : undefined}>
          Email or phone number
        </FloatingLabel>
      </div>
      {error && (
        <p id="identifier-error" role="alert" className="text-destructive animate-in fade-in slide-in-from-top-1 text-sm duration-300">
          {error}
        </p>
      )}
    </div>
  );
}
