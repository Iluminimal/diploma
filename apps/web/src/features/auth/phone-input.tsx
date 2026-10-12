"use client";

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";

function flag(code: string) {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function regionOfBrowser(): CountryCode | undefined {
  try {
    const region = new Intl.Locale(navigator.language).region;
    return getCountries().find((country) => country === region);
  } catch {
    return undefined;
  }
}

/** The number in international format ("+14155552671") if it looks valid, else null. */
export function toE164(text: string, region: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(text, region);
  return parsed?.isValid() ? parsed.number : null;
}

export type PhoneValue = { text: string; region: CountryCode };

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
  const [touched, setTouched] = useState(false);
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return getCountries()
      .map((code) => ({ code, name: names.of(code) ?? code, dial: getCountryCallingCode(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // The visitor's own country, unless they already picked one.
  useEffect(() => {
    const guess = regionOfBrowser();
    if (guess && !touched) onChange({ text: value.text, region: guess });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once, after mount
  }, []);

  function type(raw: string) {
    const typed = new AsYouType(value.region);
    const text = typed.input(raw);
    const country = typed.getCountry();
    onChange({ text, region: raw.trim().startsWith("+") && country ? country : value.region });
  }

  return (
    <div className="flex gap-2">
      <select
        aria-label="Country"
        value={value.region}
        onChange={(event) => {
          setTouched(true);
          onChange({ text: value.text, region: event.target.value as CountryCode });
        }}
        className={cn(selectClass, "w-[8.5rem] shrink-0 px-2")}
      >
        {countries.map(({ code, name, dial }) => (
          <option key={code} value={code} aria-label={`${name} +${dial}`}>
            {flag(code)} {code} +{dial}
          </option>
        ))}
      </select>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="Phone number"
        value={value.text}
        aria-invalid={invalid}
        onChange={(event) => type(event.target.value)}
        className="h-11 min-w-0 flex-1 rounded-xl"
        {...props}
      />
    </div>
  );
}
