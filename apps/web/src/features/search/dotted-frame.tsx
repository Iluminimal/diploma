import { cn } from "@/lib/utils";

type Props = {
  /** Цэнхэр (сонгосон, hover) эсвэл цагаан. */
  tone?: "white" | "brand";
  className?: string;
};

/**
 * Хувцсыг тойрсон цэгэн хүрээ (Amazon-ы зураг хайлт шиг). Цэг бүр сүүдэртэй тул ямар ч өнгөтэй зураг
 * дээр харагдана. Эцэг нь `relative`/`absolute` байх ёстой: хүрээ түүний бүх талбарыг дүүргэнэ.
 * `RegionOverlay` (хайлтын үр дүн дээр, дарагддаг) болон камерын live preview хоёул ашиглана.
 */
export function DottedFrame({ tone = "white", className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-2xl border-[3px] border-dotted drop-shadow-[0_0_1.5px_rgb(0_0_0/0.7)] transition-colors",
        tone === "brand" ? "border-brand" : "border-white",
        className,
      )}
    />
  );
}
