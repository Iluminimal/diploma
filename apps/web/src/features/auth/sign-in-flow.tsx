"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import type { AuthTranslator } from "./auth-translator";
import { useAuth } from "./auth-store";
import { CodeStep } from "./code-step";
import { IdentifierField } from "./identifier-field";
import type { AuthMode } from "./auth-mode";
import { ModeSwitch } from "./mode-switch";
import { looksLikePhone, parseIdentifier, type Identifier } from "./identifier";
import { landingPath } from "./landing";
import { NameStep } from "./name-step";
import { PasswordStep } from "./password-step";
import { DEFAULT_REGION, typePhone } from "./phone-input";
import { useAuthActions } from "./use-auth-actions";
import { useCountdown } from "./use-countdown";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";
import type { CountryCode } from "libphonenumber-js/min";
import { FormAlert } from "@/components/ui/form-alert";

const RESEND_SECONDS = 60;
type Step = "identify" | "password" | "code" | "name";

function heading(
  step: Step,
  who: Identifier | null,
  mode: AuthMode,
  t: AuthTranslator,
): { title: string; subtitle: string } {
  switch (step) {
    case "password":
      return { title: t("flow.passwordTitle"), subtitle: t("flow.passwordSubtitle") };
    case "code":
      return {
        title: t("flow.codeTitle"),
        subtitle: who ? t("flow.codeSubtitle", { who: who.shown }) : t("flow.codeSubtitleYou"),
      };
    case "name":
      return { title: t("flow.nameTitle"), subtitle: t("flow.nameSubtitle") };
    default:
      return mode === "register"
        ? { title: t("flow.registerTitle"), subtitle: t("flow.registerSubtitle") }
        : { title: t("flow.loginTitle"), subtitle: t("flow.loginSubtitle") };
  }
}

/**
 * Нэвтрэх, бүртгүүлэх нь нэг flow (apple.com, airbnb.com шиг): имэйл эсвэл утасны дугаарын нэг
 * талбар, дараа нь бичсэнд тохирсон алхам. Дээд талын "Нэвтрэх | Бүртгүүлэх" сегмент нь зөвхөн
 * эхний алхмыг өөрчилнө: бүртгүүлэх горимд имэйл нууц үг асуулгүй шууд код авна. Утсанд SMS-ээр код очно; имэйлд нууц үг, эсвэл имэйлээр
 * код. Шинэ хүний код бүртгэл үүсгэж, зөвхөн дараа нь нэр асууна. Ямар ч алхам бүртгэл байгаа
 * эсэхийг ил болгохгүй.
 */
export function SignInFlow({
  next,
  notice,
  social,
  initialMode = "login",
}: {
  next: string;
  notice?: string | null;
  social?: ReactNode;
  initialMode?: AuthMode;
}) {
  const t = useTranslations("auth");
  const userMessage = useUserMessage();
  const router = useRouter();
  const { requestCode } = useAuthActions();
  const countdown = useCountdown();
  const [step, setStep] = useState<Step>("identify");
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [text, setText] = useState("");
  const [region, setRegion] = useState<CountryCode>(DEFAULT_REGION);
  const [who, setWho] = useState<Identifier | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  useRedirectWhenSignedIn(next, !naming);

  const phone = looksLikePhone(text);
  const { title, subtitle } = heading(step, who, mode, t);

  function change(raw: string) {
    setProblem(null);
    if (!looksLikePhone(raw)) return setText(raw);
    const typed = typePhone(raw, region);
    setText(typed.text);
    setRegion(typed.region);
  }

  function finish() {
    router.replace(landingPath(next, useAuth.getState().user?.role));
    router.refresh();
  }

  /** Код илгээнэ. Илгээгдсэн эсэхийг буцаана; үгүй бол шалтгаан нь `problem`-д. */
  async function sendCode(destination: string) {
    setProblem(null);
    setBusy(true);
    try {
      await requestCode(destination);
      countdown.start(RESEND_SECONDS);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) countdown.start(error.retryAfter);
      setProblem(userMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function identify(event: FormEvent) {
    event.preventDefault();
    const parsed = parseIdentifier(text, region, t);
    if ("error" in parsed) return setProblem(parsed.error);
    setWho(parsed);
    setProblem(null);
    if (parsed.kind === "email" && mode === "login") return setStep("password");
    if (await sendCode(parsed.destination)) setStep("code");
  }

  function edit() {
    setProblem(null);
    setStep("identify");
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2 text-center">
        <h1 id="step-heading" className="type-title">
          {title}
        </h1>
        <p className="text-muted-foreground type-body">{subtitle}</p>
      </header>

      {notice && (
        <FormAlert>
          {notice}
        </FormAlert>
      )}

      <div key={step} className="animate-in fade-in slide-in-from-right-4 space-y-5 duration-300 motion-reduce:animate-none">
        {(step === "password" || step === "code") && who && (
          <button
            type="button"
            onClick={edit}
            aria-label={t("flow.change", { who: who.shown })}
            className="border-field bg-card hover:bg-secondary focus-visible:ring-ring/50 mx-auto flex max-w-full items-center gap-2 rounded-full border py-1.5 pr-3 pl-4 type-caption outline-none transition-colors focus-visible:ring-3"
          >
            <span className="truncate font-medium">{who.shown}</span>
            <span className="text-muted-foreground shrink-0 underline underline-offset-4">{t("flow.edit")}</span>
          </button>
        )}

        {step === "identify" && (
          <>
            <ModeSwitch
              mode={mode}
              onChange={(value) => {
                setProblem(null);
                setMode(value);
              }}
            />
            <form onSubmit={identify} noValidate className="space-y-4" aria-label={title}>
              <IdentifierField
                value={text}
                onChange={change}
                phone={phone}
                region={region}
                onRegionChange={setRegion}
                error={problem ?? undefined}
              />
              <Button type="submit" size="lg" disabled={busy} className="w-full">
                {busy && <Loader2 className="animate-spin" />} {t("flow.continue")}
              </Button>
            </form>
            {social}
          </>
        )}

        {step === "password" && who?.kind === "email" && (
          <PasswordStep
            email={who.destination}
            next={next}
            onSignedIn={finish}
            codeBusy={busy}
            codeProblem={problem}
            onUseCode={async () => {
              if (await sendCode(who.destination)) setStep("code");
            }}
          />
        )}

        {step === "code" && who && (
          <>
            <CodeStep
              destination={who.destination}
              resendIn={countdown.remaining}
              onResend={() => void sendCode(who.destination)}
              onNaming={() => setNaming(true)}
              onVerified={(isNew) => {
                if (isNew) return setStep("name");
                toast.success(t("flow.welcomeBack"));
                finish();
              }}
            />
            {problem && (
              <p role="alert" className="text-destructive text-center type-caption">
                {problem}
              </p>
            )}
          </>
        )}

        {step === "name" && <NameStep onDone={finish} />}
      </div>
    </div>
  );
}
