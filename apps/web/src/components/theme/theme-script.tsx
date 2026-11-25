// Сонголт хадгалагдаагүй бол цайвар (дэлгүүрийн анхдагч); "system" сонговол OS-ийг дагана.
// Анхны paint-аас өмнө ажиллана, ингэснээр харанхуй сонгосон зочин цагаан гялбаа хэзээ ч харахгүй.
// Зориудаар Server Component: client component-ээс render хийсэн script ажилладаггүй.
const SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="system"?matchMedia("(prefers-color-scheme: dark)").matches:t==="dark";var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

/**
 * `nonce` нь хүсэлтийн CSP nonce (`proxy.ts`): nonce-гүй inline script ажиллахгүй. Layout уншиж
 * дамжуулдаг: энэ component өөрөө async (`headers()` хүлээх) байвал `<head>` дотор түдгэлзэж, React
 * түүнийг `<head>`-ээс гадуур урсгаж hydration зөрнө.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
