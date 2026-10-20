import { cn } from "@/lib/utils";

/**
 * Bar дахь icon товч бүрийн нийтлэг хэсэг, ингэснээр хайлт, account, bag, цэс нэг хэмжээтэй: 44px
 * өргөн, bar-тай ижил өндөр (утсан дээр 48px, md-ээс 44px), дэвсгэргүй, apple.com шиг hover дээр
 * icon бага зэрэг бүдгэрнэ. Focus ring нь бүх cell биш, icon-ы эргэн тойрон жижиг дугуйрсан
 * хайрцаг.
 */
export const HEADER_CELL =
  "focus-visible:outline-ring relative grid h-12 w-11 shrink-0 place-items-center rounded-[5px] outline-none transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-[7px] md:h-11";

/**
 * Bar-ын хоёр icon хайрцагт зурсан дүрс: утсан дээр 17x48, md-ээс дээш 14x44. Хайлт, bag нь
 * apple.com-ийн өөрийн контурыг ашигладаг; хүний дүрсийг тэдгээрийн зузаантай тааруулж зурсан.
 */
function Glyph({ className, phone, desktop }: { className?: string; phone: React.ReactNode; desktop: React.ReactNode }) {
  return (
    <>
      <svg aria-hidden className={cn("overflow-visible md:hidden", className)} width="17" height="48" viewBox="0 0 17 48" fill="currentColor">
        {phone}
      </svg>
      <svg aria-hidden className={cn("hidden overflow-visible md:block", className)} width="14" height="44" viewBox="0 0 14 44" fill="currentColor">
        {desktop}
      </svg>
    </>
  );
}

export function SearchGlyph() {
  return (
    <Glyph
      phone={
        <path d="m16.2294 29.9556-4.1755-4.0821a6.4711 6.4711 0 1 0 -1.2839 1.2625l4.2005 4.1066a.9.9 0 1 0 1.2588-1.287zm-14.5294-8.0017a5.2455 5.2455 0 1 1 5.2455 5.2527 5.2549 5.2549 0 0 1 -5.2455-5.2527z" />
      }
      desktop={
        <path d="M13.298,27.202l-3.87-3.87c0.701-0.929,1.122-2.081,1.122-3.332c0-3.06-2.489-5.55-5.55-5.55c-3.06,0-5.55,2.49-5.55,5.55 c0,3.061,2.49,5.55,5.55,5.55c1.251,0,2.403-0.421,3.332-1.122l3.87,3.87c0.151,0.151,0.35,0.228,0.548,0.228 s0.396-0.076,0.548-0.228C13.601,27.995,13.601,27.505,13.298,27.202z M0.55,20c0-2.454,1.997-4.45,4.45-4.45 c2.454,0,4.45,1.997,4.45,4.45S7.454,24.45,5,24.45C2.546,24.45,0.55,22.454,0.55,20z" />
      }
    />
  );
}

export function PersonGlyph() {
  const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <Glyph
      phone={
        <>
          <circle cx="8.5" cy="20.4" r="3.4" {...stroke} strokeWidth="1.3" />
          <path d="M1.9 31.2c0-3.6 2.9-5.6 6.6-5.6s6.6 2 6.6 5.6" {...stroke} strokeWidth="1.3" />
        </>
      }
      desktop={
        <>
          <circle cx="7" cy="17.6" r="2.9" {...stroke} strokeWidth="1.1" />
          <path d="M1.4 26.6c0-3 2.5-4.7 5.6-4.7s5.6 1.7 5.6 4.7" {...stroke} strokeWidth="1.1" />
        </>
      }
    />
  );
}

export function BagGlyph() {
  return (
    <Glyph
      phone={
        <path d="m13.4575 16.9268h-1.1353a3.8394 3.8394 0 0 0 -7.6444 0h-1.1353a2.6032 2.6032 0 0 0 -2.6 2.6v8.9232a2.6032 2.6032 0 0 0 2.6 2.6h9.915a2.6032 2.6032 0 0 0 2.6-2.6v-8.9231a2.6032 2.6032 0 0 0 -2.6-2.6001zm-4.9575-2.2768a2.658 2.658 0 0 1 2.6221 2.2764h-5.2442a2.658 2.658 0 0 1 2.6221-2.2764zm6.3574 13.8a1.4014 1.4014 0 0 1 -1.4 1.4h-9.9149a1.4014 1.4014 0 0 1 -1.4-1.4v-8.9231a1.4014 1.4014 0 0 1 1.4-1.4h9.915a1.4014 1.4014 0 0 1 1.4 1.4z" />
      }
      desktop={
        <path d="m11.3535 16.0283h-1.0205a3.4229 3.4229 0 0 0 -3.333-2.9648 3.4229 3.4229 0 0 0 -3.333 2.9648h-1.02a2.1184 2.1184 0 0 0 -2.117 2.1162v7.7155a2.1186 2.1186 0 0 0 2.1162 2.1167h8.707a2.1186 2.1186 0 0 0 2.1168-2.1167v-7.7155a2.1184 2.1184 0 0 0 -2.1165-2.1162zm-4.3535-1.8652a2.3169 2.3169 0 0 1 2.2222 1.8652h-4.4444a2.3169 2.3169 0 0 1 2.2222-1.8652zm5.37 11.6969a1.0182 1.0182 0 0 1 -1.0166 1.0171h-8.7069a1.0182 1.0182 0 0 1 -1.0165-1.0171v-7.7155a1.0178 1.0178 0 0 1 1.0166-1.0166h8.707a1.0178 1.0178 0 0 1 1.0164 1.0166z" />
      }
    />
  );
}
