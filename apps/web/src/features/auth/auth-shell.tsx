import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/reveal";

/**
 * Нэвтрэх, нууц үгийн хуудсууд (Apple Account-ын хуудас шиг): том гарчигтай нэг багана, тусламжийн
 * мөр, form. Өөр юу ч анхаарал сарниулахгүй. Гарчиг нь явцдаа солигддог хуудас (нэвтрэх flow)
 * `title`-ыг орхиж, өөрөө зурна.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="container-page flex min-h-[calc(100dvh-9rem)] items-start justify-center py-12 md:items-center md:py-16">
      <Reveal when="mount" y={16} className="w-full max-w-[26rem] space-y-8">
        {title && (
          <header className="space-y-2 text-center">
            <h1 className="type-title">{title}</h1>
            {subtitle && <p className="text-muted-foreground type-body">{subtitle}</p>}
          </header>
        )}
        {children}
      </Reveal>
    </div>
  );
}
