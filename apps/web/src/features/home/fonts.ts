import { Geist } from "next/font/google";

/**
 * Нүүр хуудасны (GitHub загварын) фонт. Зөвхөн нүүр хуудас импортолдог тул Next.js эдгээр файлыг
 * зөвхөн энэ route-д ачаалдаг (self-host, preload): бусад хуудасны ачаалалд нөлөөлөхгүй. Монгол
 * кирилл (`cyrillic`) Geist-д бий.
 */
export const geistSans = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist-sans", display: "swap", preload: false });
