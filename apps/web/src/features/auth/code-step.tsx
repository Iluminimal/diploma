"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";
import { OtpInput } from "./otp-input";
import { useAuthActions } from "./use-auth-actions";

/** Утас эсвэл имэйлээр ирсэн зургаан орон. Үүгээр нэвтрэхэд шинэ бүртгэл бас үүснэ. */
export function CodeStep({
  destination,
  resendIn,
  onResend,
  onVerified,
  onNaming,
}: {
  destination: string;
  /** Дахин код авахаас өмнө үлдсэн секунд. */
  resendIn: number;
  onResend: () => void;
  /** Session хадгалагдсан. Шинээр үүссэн бүртгэлд `isNew` нь true. */
  onVerified: (isNew: boolean) => void;
  /** Шинэ бүртгэлд session хадгалахаас өмнө дуудна, ингэснээр хуудас хараахан redirect хийхгүй. */
  onNaming: () => void;
}) {
  const { signInWithCode } = useAuthActions();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  async function verify(entered: string) {
    if (busy) return;
    setProblem(null);
    setBusy(true);
    try {
      onVerified(await signInWithCode({ destination, code: entered }, onNaming));
    } catch (error) {
      setProblem(userMessage(error));
      setShake((count) => count + 1);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" aria-label="Enter your code">
      <div key={shake}>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={verify}
          invalid={Boolean(problem)}
          disabled={busy}
          autoFocus
          describedBy="step-heading"
        />
      </div>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <Button type="button" size="lg" disabled={busy || code.length < 6} onClick={() => verify(code)} className="w-full">
        {busy && <Loader2 className="animate-spin" />} Continue
      </Button>
      <button
        type="button"
        disabled={resendIn > 0 || busy}
        onClick={() => {
          setProblem(null);
          setCode("");
          onResend();
        }}
        className="text-muted-foreground hover:text-foreground mx-auto block text-sm underline underline-offset-4 disabled:no-underline disabled:opacity-60"
      >
        {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
      </button>
    </div>
  );
}
