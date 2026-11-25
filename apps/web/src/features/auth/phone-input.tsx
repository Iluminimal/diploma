"use client";

import { AsYouType, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

/** Утасны талбар бүр эхэлдэг улс. */
export const DEFAULT_REGION: CountryCode = "MN";

/**
 * Санал болгох улсууд: бүх улсын оронд гол улсуудын богино жагсаалт, Монгол нэгдүгээрт. Өөр улсын
 * дугаарыг бүтнээр нь ("+39 ...") бичихэд бас ажиллана: сонгогч тэр улсыг бас харуулна.
 */
const MAIN_COUNTRIES = ["MN", "US", "GB", "CN", "RU", "KR", "JP", "KZ", "CA", "AU", "DE", "FR"] as const satisfies CountryCode[];
type MainCountry = (typeof MAIN_COUNTRIES)[number];

function isMainCountry(code: CountryCode): code is MainCountry {
  return (MAIN_COUNTRIES as readonly string[]).includes(code);
}

function flag(code: string) {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** Хүчинтэй харагдаж байвал олон улсын форматтай дугаар ("+97688112233"), үгүй бол null. */
export function toE164(text: string, region: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(text, region);
  return parsed?.isValid() ? parsed.number : null;
}

export type PhoneValue = { text: string; region: CountryCode };

/** Улс сонгогч (сонголт бүрд тугны, кодын, утасны код). */
export function CountrySelect({
  value,
  onChange,
  className,
}: {
  value: CountryCode;
  onChange: (region: CountryCode) => void;
  className?: string;
}) {
  const t = useTranslations("auth.phone");
  // Богино жагсаалтад байхгүй ч бүтнээр нь ("+39 ...") бичсэн улсыг сонгох боломжтой байх ёстой.
  const codes: CountryCode[] = isMainCountry(value) ? [...MAIN_COUNTRIES] : [...MAIN_COUNTRIES, value];
  const countries = codes.map((code) => ({ code, name: isMainCountry(code) ? t(`countries.${code}`) : code }));
  return (
    <NativeSelect aria-label={t("country")} value={value} onChange={(event) => onChange(event.target.value as CountryCode)} className={className}>
      {countries.map(({ code, name }) => (
        <option key={code} value={code} aria-label={`${name} +${getCountryCallingCode(code)}`}>
          {flag(code)} {code} +{getCountryCallingCode(code)}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * Утасны талбарт бичсэн текстээс юу гарах: бичихийн хэрээр форматлагдаж, "+" дугаар улсаа сонгоно.
 */
export function typePhone(raw: string, region: CountryCode): PhoneValue {
  const typed = new AsYouType(region);
  const text = typed.input(raw);
  const country = typed.getCountry();
  return { text, region: raw.trim().startsWith("+") && country ? country : region };
}

/**
 * Утасны дугаарын талбар: улс сонгогч ба дугаар, бичихийн хэрээр форматлагдана. Бүтэн "+976 ..."
 * дугаар буулгавал сонгогч юу ч байсан ажиллана. Илгээх утгыг `toE164`-өөр авна.
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
  const t = useTranslations("auth.phone");
  return (
    <div className="flex gap-2">
      <CountrySelect
        value={value.region}
        onChange={(region) => onChange({ text: value.text, region })}
        className="w-[8.5rem] shrink-0"
      />
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={t("number")}
        value={value.text}
        aria-invalid={invalid}
        onChange={(event) => onChange(typePhone(event.target.value, value.region))}
        className="min-w-0 flex-1"
        {...props}
      />
    </div>
  );
}
