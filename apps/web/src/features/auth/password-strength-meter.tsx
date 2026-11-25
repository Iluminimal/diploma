import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { passwordStrength } from "./password-strength";

const COLOURS = ["", "bg-destructive", "bg-warning", "bg-success", "bg-success"];

/** Нууц үг уртсах тусам дүүрдэг дөрвөн хэсэг, мөн адил зүйлийг үгээр харуулна. */
export function PasswordStrengthMeter({ password, id }: { password: string; id: string }) {
  const t = useTranslations("auth");
  const { score, label } = passwordStrength(password, t);
  if (score === 0) return null;
  return (
    <div className="space-y-1.5">
      <div aria-hidden className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1 rounded-full transition-colors duration-300",
              segment <= score ? COLOURS[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p id={id} aria-live="polite" className="text-muted-foreground type-fine">
        {label}
      </p>
    </div>
  );
}
