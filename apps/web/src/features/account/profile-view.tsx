"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, KeyRound, Loader2, Mail, Phone, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import "@/lib/zod-jitless";
import { z } from "zod";
import { Field, fieldAria } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/layout/user-avatar";
import { useAuth, type SessionUser } from "@/features/auth/auth-store";
import { PasswordStrengthMeter } from "@/features/auth/password-strength-meter";
import { useFieldError } from "@/i18n/use-field-error";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import { ContactDialog, RemoveContactDialog, type ContactKind } from "./contact-dialog";
import { DevicesCard } from "./devices-card";
import { SecurityActivityCard } from "./security-activity";
import { useChangePassword, useDeleteAccount, useUpdateName } from "./use-profile";
import { FormAlert } from "@/components/ui/form-alert";

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="tile space-y-5 p-6 sm:p-8">
      <header className="space-y-1">
        <h2 className="type-heading">{title}</h2>
        {description && <p className="text-muted-foreground type-caption">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function ProfileView() {
  const t = useTranslations("account.profile");
  const user = useAuth((state) => state.user);
  if (!user) return <Skeleton aria-busy aria-label={t("loading")} className="h-96 rounded-[var(--radius-tile)]" />;
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <ProfileCard user={user} />
      <SignInMethods user={user} />
      <DevicesCard />
      <SecurityActivityCard />
      <DeleteAccount user={user} />
    </div>
  );
}

// --- профайл --- -----------------------------------------------------------------------------

const nameSchema = z.object({
  full_name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
});
type NameValues = z.infer<typeof nameSchema>;

function ProfileCard({ user }: { user: SessionUser }) {
  const t = useTranslations("account.profile");
  const userMessage = useUserMessage();
  const fieldError = useFieldError();
  const rename = useUpdateName();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<NameValues>({ resolver: zodResolver(nameSchema), defaultValues: { full_name: user.full_name } });

  const save = handleSubmit(async ({ full_name }) => {
    try {
      const updated = await rename.mutateAsync(full_name);
      reset({ full_name: updated.full_name });
      toast.success(t("nameUpdated"));
    } catch (error) {
      toast.error(userMessage(error));
    }
  });

  return (
    <Card title={t("title")}>
      <div className="flex items-center gap-4">
        <UserAvatar user={user} size={64} />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.full_name}</p>
          <p className="text-muted-foreground truncate type-caption">{user.email ?? user.phone}</p>
        </div>
      </div>
      <form onSubmit={save} noValidate className="space-y-4" aria-label={t("editName")}>
        <Field id="profile-name" label={t("fullName")} error={fieldError(errors.full_name?.message)}>
          <Input
            autoComplete="name"
            {...fieldAria("profile-name", fieldError(errors.full_name?.message))}
            {...register("full_name")}
          />
        </Field>
        <Button type="submit" disabled={!isDirty || rename.isPending}>
          {rename.isPending && <Loader2 className="animate-spin" />} {t("save")}
        </Button>
      </form>
    </Card>
  );
}

// --- нэвтрэх аргууд --- ----------------------------------------------------------------------

function Method({ name, status, children }: { name: string; status: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="space-y-0.5">
        <p className="type-caption font-medium">{name}</p>
        <p className="text-muted-foreground type-caption">{status}</p>
      </div>
      {children}
    </li>
  );
}

function Verified({ yes }: { yes: boolean }) {
  const t = useTranslations("account.methods");
  return yes ? (
    <span className="text-success inline-flex items-center gap-1.5">
      <Check aria-hidden className="size-4" /> {t("verified")}
    </span>
  ) : (
    <span>{t("notVerified")}</span>
  );
}

function SignInMethods({ user }: { user: SessionUser }) {
  const t = useTranslations("account.methods");
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<ContactKind | null>(null);
  const [removing, setRemoving] = useState<"phone" | "email" | null>(null);
  const google = user.providers.includes("google");
  // Сүүлчийн нэвтрэх аргыг устгах боломжгүй (API шаардлагыг хангуулна; энд зөвхөн товчийг нууна).
  const canRemovePhone = user.phone !== null && user.email !== null;
  const canRemoveEmail = user.email !== null && user.phone !== null;
  return (
    <Card title={t("title")} description={t("description")}>
      <ul className="divide-border divide-y">
        <Method
          name={t("phone")}
          status={
            user.phone ? (
              <>
                {user.phone} · <Verified yes={user.phone_verified} />
              </>
            ) : (
              t("phoneMissing")
            )
          }
        >
          <div className="flex gap-2">
            <Button variant="bordered" onClick={() => setContact("phone")}>
              <Phone aria-hidden /> {user.phone ? t("changePhone") : t("addPhone")}
            </Button>
            {canRemovePhone && (
              <Button variant="ghost" onClick={() => setRemoving("phone")}>
                {t("removePhone")}
              </Button>
            )}
          </div>
        </Method>
        <Method
          name={t("email")}
          status={
            user.email ? (
              <>
                {user.email} · <Verified yes={user.email_verified} />
              </>
            ) : (
              t("emailMissing")
            )
          }
        >
          <div className="flex flex-wrap gap-2">
            {user.email && !user.email_verified && (
              <Button variant="bordered" onClick={() => setContact("verify-email")}>
                {t("verifyEmail")}
              </Button>
            )}
            <Button variant="bordered" onClick={() => setContact("email")}>
              <Mail aria-hidden /> {user.email ? t("changeEmail") : t("addEmail")}
            </Button>
            {canRemoveEmail && (
              <Button variant="ghost" onClick={() => setRemoving("email")}>
                {t("removeEmail")}
              </Button>
            )}
          </div>
        </Method>
        <Method
          name={t("google")}
          status={
            google ? (
              <span className="text-success inline-flex items-center gap-1.5">
                <Check aria-hidden className="size-4" /> {t("googleConnected")}
              </span>
            ) : (
              t("googleMissing")
            )
          }
        />
        {user.email && (
          <Method
            name={t("password")}
            status={user.has_password ? t("passwordSet") : google ? t("passwordGoogle") : t("passwordCode")}
          >
            <Button variant="bordered" onClick={() => setOpen(true)}>
              <KeyRound aria-hidden /> {user.has_password ? t("changePassword") : t("setPassword")}
            </Button>
          </Method>
        )}
      </ul>
      {contact && <ContactDialog key={contact} kind={contact} user={user} open onOpenChange={(next) => !next && setContact(null)} />}
      {removing && <RemoveContactDialog kind={removing} user={user} open onOpenChange={(next) => !next && setRemoving(null)} />}
      <PasswordDialog open={open} onOpenChange={setOpen} hasPassword={user.has_password} />
    </Card>
  );
}

const passwordSchema = z
  .object({
    current_password: z.string().max(128),
    new_password: z.string().min(10, "passwordMin").max(128, "passwordMax"),
    confirm: z.string(),
  })
  .refine((values) => values.new_password === values.confirm, {
    path: ["confirm"],
    message: "passwordMismatch",
  });
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordDialog({
  open,
  onOpenChange,
  hasPassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPassword: boolean;
}) {
  const t = useTranslations("account.password");
  const userMessage = useUserMessage();
  const fieldError = useFieldError();
  const change = useChangePassword();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });
  const typed = useWatch({ control, name: "new_password" });

  const submit = handleSubmit(async (values) => {
    if (hasPassword && !values.current_password) {
      setError("current_password", { message: "currentPasswordRequired" });
      return;
    }
    try {
      await change.mutateAsync({
        new_password: values.new_password,
        ...(hasPassword ? { current_password: values.current_password } : {}),
      });
      toast.success(hasPassword ? t("changed") : t("set"));
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.is("invalidCredentials")) {
        setError("current_password", { message: "currentPasswordWrong" });
      } else {
        toast.error(userMessage(error));
      }
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{hasPassword ? t("changeTitle") : t("setTitle")}</DialogTitle>
          <DialogDescription>
            {hasPassword ? t("changeDescription") : t("setDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={hasPassword ? t("changeTitle") : t("setTitle")}>
          {hasPassword && (
            <Field id="current-password" label={t("current")} error={fieldError(errors.current_password?.message)}>
              <PasswordInput
                autoComplete="current-password"
                {...fieldAria("current-password", fieldError(errors.current_password?.message))}
                {...register("current_password")}
              />
            </Field>
          )}
          <Field id="new-password" label={t("new")} error={fieldError(errors.new_password?.message)}>
            <PasswordInput
              autoComplete="new-password"
              {...fieldAria("new-password", fieldError(errors.new_password?.message))}
              {...register("new_password")}
            />
          </Field>
          <PasswordStrengthMeter password={typed ?? ""} id="new-password-strength" />
          <Field id="confirm-password" label={t("confirm")} error={fieldError(errors.confirm?.message)}>
            <PasswordInput
              autoComplete="new-password"
              {...fieldAria("confirm-password", fieldError(errors.confirm?.message))}
              {...register("confirm")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={change.isPending} className="rounded-full">
              {change.isPending && <Loader2 className="animate-spin" />} {hasPassword ? t("submitChange") : t("submitSet")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- устгах --- ------------------------------------------------------------------------------

function DeleteAccount({ user }: { user: SessionUser }) {
  const t = useTranslations("account.delete");
  const [open, setOpen] = useState(false);
  return (
    <Card title={t("title")} description={t("description")}>
      <p className="text-muted-foreground type-caption">
        {t("kept")}
      </p>
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> {t("open")}
      </Button>
      <DeleteDialog open={open} onOpenChange={setOpen} user={user} />
    </Card>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: SessionUser;
}) {
  const t = useTranslations("account.delete");
  const userMessage = useUserMessage();
  const router = useRouter();
  const remove = useDeleteAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const identifier = user.email ?? user.phone ?? "";
  const matches = email.trim().toLowerCase() === identifier.toLowerCase();
  const ready = matches && (!user.has_password || password.length > 0);

  async function confirm() {
    setProblem(null);
    try {
      await remove.mutateAsync({ confirm: email.trim(), ...(user.has_password ? { password } : {}) });
      toast(t("deleted"));
      router.push("/");
      router.refresh();
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.is("invalidCredentials") ? t("wrongPassword") : userMessage(error),
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setEmail("");
          setPassword("");
          setProblem(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t.rich("confirmDescription", {
              identifier,
              b: (chunks) => <strong className="text-foreground">{chunks}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="delete-email" label={user.email ? t("yourEmail") : t("yourPhone")}>
            <Input
              id="delete-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
            />
          </Field>
          {user.has_password && (
            <Field id="delete-password" label={t("yourPassword")}>
              <PasswordInput
                id="delete-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
          )}
          {problem && (
            <FormAlert>
              {problem}
            </FormAlert>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("keep")}
          </Button>
          <Button variant="destructive" disabled={!ready || remove.isPending} onClick={() => void confirm()} className="rounded-full">
            {remove.isPending && <Loader2 className="animate-spin" />} {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
