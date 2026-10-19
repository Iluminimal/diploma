"use client";

import { AsYouType, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";

/** The country every phone field starts on. */
export const DEFAULT_REGION: CountryCode = "MN";

/**
 * The countries on offer: a short list of the main ones, Mongolia first, instead of every country
 * there is. Numbers from anywhere else still work when typed in full ("+39 ..."): the picker then
 * shows that country too.
 */
const MAIN_COUNTRIES: { code: CountryCode; name: string }[] = [
  { code: "MN", name: "Mongolia" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CN", name: "China" },
  { code: "RU", name: "Russia" },
  { code: "KR", name: "South Korea" },
  { code: "JP", name: "Japan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
];

function flag(code: string) {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** The number in international format ("+97688112233") if it looks valid, else null. */
export function toE164(text: string, region: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(text, region);
  return parsed?.isValid() ? parsed.number : null;
}

export type PhoneValue = { text: string; region: CountryCode };

/** A country picker (flag, code and dial code per option). */
export function CountrySelect({
  value,
  onChange,
  className,
}: {
  value: CountryCode;
  onChange: (region: CountryCode) => void;
  className?: string;
}) {
  // A country typed in full ("+39 ...") that is not on the short list still has to be selectable.
  const countries = MAIN_COUNTRIES.some(({ code }) => code === value)
    ? MAIN_COUNTRIES
    : [...MAIN_COUNTRIES, { code: value, name: value }];
  return (
    <select aria-label="Country" value={value} onChange={(event) => onChange(event.target.value as CountryCode)} className={className}>
      {countries.map(({ code, name }) => (
        <option key={code} value={code} aria-label={`${name} +${getCountryCallingCode(code)}`}>
          {flag(code)} {code} +{getCountryCallingCode(code)}
        </option>
      ))}
    </select>
  );
}

/** What a phone field makes of the text typed into it: formatted as typed, and a "+" number picks its country. */
export function typePhone(raw: string, region: CountryCode): PhoneValue {
  const typed = new AsYouType(region);
  const text = typed.input(raw);
  const country = typed.getCountry();
  return { text, region: raw.trim().startsWith("+") && country ? country : region };
}

/**
 * A phone number field: a country picker and the number, formatted as it is typed. Pasting a
 * full "+976 ..." number works whatever the picker says. Use `toE164` for what to send.
 */
export function PhoneInput({
  value,
  onChange,
  invalid,
  ...props
}: {
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  invalid?: boolean;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  return (
    <div className="flex gap-2">
      <CountrySelect
        value={value.region}
        onChange={(region) => onChange({ text: value.text, region })}
        className={cn(selectClass, "w-[8.5rem] shrink-0 px-2")}
      />
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="Phone number"
        value={value.text}
        aria-invalid={invalid}
        onChange={(event) => onChange(typePhone(event.target.value, value.region))}
        className="h-11 min-w-0 flex-1 rounded-xl"
        {...props}
      />
    </div>
  );
}
