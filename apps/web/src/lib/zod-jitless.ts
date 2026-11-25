import { z } from "zod";

/**
 * Zod 4 хурдасгахын тулд `new Function`-ээр schema бүрийг эхлээд туршдаг. Content-Security-Policy
 * `unsafe-eval`-ийг хаадаг (`src/lib/security-headers.ts`) тул тэр оролдлого бүр зөрчил болж
 * мэдээлэгддэг, дараа нь Zod ердийн замаараа ажиллана. `jitless` нь оролдлогыг эхнээс нь хийхгүй.
 * Form шалгалт нь хэдхэн талбар тул хурдны зөрүү мэдэгдэхгүй.
 *
 * Zod ашигладаг browser талын файл бүр схемээ үүсгэхээс өмнө `import "@/lib/zod-jitless"` хийнэ.
 */
z.config({ jitless: true });
