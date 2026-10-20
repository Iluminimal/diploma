// Анхны paint-аас өмнө ажиллана, ингэснээр харанхуй сонгосон зочин цагаан гялбаа хэзээ ч харахгүй.
// Зориудаар Server Component: client component-ээс render хийсэн script ажилладаггүй.
const SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
