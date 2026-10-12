"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, KeyRound, Loader2, Mail, Phone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
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
import { ApiError, userMessage } from "@/lib/api/errors";
import { ContactDialog, RemoveContactDialog, type ContactKind } from "./contact-dialog";
import { DevicesCard } from "./devices-card";
import { useChangePassword, useDeleteAccount, useUpdateName } from "./use-profile";

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-border space-y-5 rounded-3xl border p-5 sm:p-7">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function ProfileView() {
  const user = useAuth((state) => state.user);
  if (!user) return <Skeleton aria-busy aria-label="Loading your profile" className="h-96 rounded-3xl" />;
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <ProfileCard user={user} />
      <SignInMethods user={user} />
      <DevicesCard />
      <DeleteAccount user={user} />
    </div>
  );
}

// --- profile ---------------------------------------------------------------------------------

const nameSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name").max(120, "Keep it under 120 characters"),
});
type NameValues = z.infer<typeof nameSchema>;

function ProfileCard({ user }: { user: SessionUser }) {
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
      toast.success("Name updated.");
    } catch (error) {
      toast.error(userMessage(error));
    }
  });

  return (
    <Card title="Profile">
      <div className="flex items-center gap-4">
        <UserAvatar user={user} size={64} />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.full_name}</p>
          <p className="text-muted-foreground truncate text-sm">{user.email ?? user.phone}</p>
        </div>
      </div>
      <form onSubmit={save} noValidate className="space-y-4" aria-label="Edit your name">
        <Field id="profile-name" label="Full name" error={errors.full_name?.message}>
          <Input
            autoComplete="name"
            className="h-11 rounded-xl"
            {...fieldAria("profile-name", errors.full_name?.message)}
            {...register("full_name")}
          />
        </Field>
        <Button type="submit" disabled={!isDirty || rename.isPending} className="h-10 rounded-full px-5">
          {rename.isPending && <Loader2 className="animate-spin" />} Save changes
        </Button>
      </form>
    </Card>
  );
}

// --- sign-in methods -------------------------------------------------------------------------

function Method({ name, status, children }: { name: string; status: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-muted-foreground text-sm">{status}</p>
      </div>
      {children}
    </li>
  );
}

function Verified({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="text-success inline-flex items-center gap-1.5">
      <Check aria-hidden className="size-4" /> Verified
    </span>
  ) : (
    <span>Not verified</span>
  );
}

function SignInMethods({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<ContactKind | null>(null);
  const [removing, setRemoving] = useState<"phone" | "email" | null>(null);
  const google = user.providers.includes("google");
  // The last way to sign in cannot be removed (the API enforces it; this just hides the button).
  const canRemovePhone = user.phone !== null && user.email !== null;
  const canRemoveEmail = user.email !== null && user.phone !== null;
  return (
    <Card title="How you sign in" description="You can use any of these to get back into your account.">
      <ul className="divide-border divide-y">
        <Method
          name="Phone number"
          status={
            user.phone ? (
              <>
                {user.phone} · <Verified yes={user.phone_verified} />
              </>
            ) : (
              "Not added. Add one to sign in with a text-message code."
            )
          }
        >
          <div className="flex gap-2">
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setContact("phone")}>
              <Phone aria-hidden /> {user.phone ? "Change phone" : "Add a phone"}
            </Button>
            {canRemovePhone && (
              <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => setRemoving("phone")}>
                Remove phone
              </Button>
            )}
          </div>
        </Method>
        <Method
          name="Email"
          status={
            user.email ? (
              <>
                {user.email} · <Verified yes={user.email_verified} />
              </>
            ) : (
              "Not added. Add one for receipts and to sign in with a password."
            )
          }
        >
          <div className="flex flex-wrap gap-2">
            {user.email && !user.email_verified && (
              <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setContact("verify-email")}>
                Verify email
              </Button>
            )}
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setContact("email")}>
              <Mail aria-hidden /> {user.email ? "Change email" : "Add an email"}
            </Button>
            {canRemoveEmail && (
              <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => setRemoving("email")}>
                Remove email
              </Button>
            )}
          </div>
        </Method>
        <Method
          name="Google"
          status={
            google ? (
              <span className="text-success inline-flex items-center gap-1.5">
                <Check aria-hidden className="size-4" /> Connected
              </span>
            ) : (
              "Not connected. Sign in with Google using this email to connect it."
            )
          }
        />
        {user.email && (
          <Method
            name="Password"
            status={user.has_password ? "Set" : google ? "Not set. You sign in with Google." : "Not set. You sign in with a code."}
          >
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen(true)}>
              <KeyRound aria-hidden /> {user.has_password ? "Change password" : "Set a password"}
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
    new_password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
    confirm: z.string(),
  })
  .refine((values) => values.new_password === values.confirm, {
    path: ["confirm"],
    message: "The two passwords don't match",
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
      setError("current_password", { message: "Enter your current password" });
      return;
    }
    try {
      await change.mutateAsync({
        new_password: values.new_password,
        ...(hasPassword ? { current_password: values.current_password } : {}),
      });
      toast.success(hasPassword ? "Password changed. Your other devices were signed out." : "Password set. You can now sign in with it.");
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.is("invalidCredentials")) {
        setError("current_password", { message: "That isn't your current password" });
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
          <DialogTitle>{hasPassword ? "Change password" : "Set a password"}</DialogTitle>
          <DialogDescription>
            {hasPassword
              ? "You'll stay signed in here; your other devices will be signed out."
              : "Add a password so you can also sign in with your email."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={hasPassword ? "Change password" : "Set a password"}>
          {hasPassword && (
            <Field id="current-password" label="Current password" error={errors.current_password?.message}>
              <PasswordInput
                autoComplete="current-password"
                className="h-11 rounded-xl"
                {...fieldAria("current-password", errors.current_password?.message)}
                {...register("current_password")}
              />
            </Field>
          )}
          <Field id="new-password" label="New password" error={errors.new_password?.message}>
            <PasswordInput
              autoComplete="new-password"
              className="h-11 rounded-xl"
              {...fieldAria("new-password", errors.new_password?.message)}
              {...register("new_password")}
            />
          </Field>
          <PasswordStrengthMeter password={typed ?? ""} id="new-password-strength" />
          <Field id="confirm-password" label="Confirm new password" error={errors.confirm?.message}>
            <PasswordInput
              autoComplete="new-password"
              className="h-11 rounded-xl"
              {...fieldAria("confirm-password", errors.confirm?.message)}
              {...register("confirm")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={change.isPending} className="rounded-full">
              {change.isPending && <Loader2 className="animate-spin" />} {hasPassword ? "Change password" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- delete ----------------------------------------------------------------------------------

function DeleteAccount({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  return (
    <Card title="Delete account" description="Removes your details, addresses, wishlist and Bag, and signs you out everywhere.">
      <p className="text-muted-foreground text-sm">
        Orders you have placed are kept for the shop&apos;s records, without your account attached. This can&apos;t be undone.
      </p>
      <Button variant="outline" className="text-destructive h-10 rounded-full px-4" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Delete my account
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
      toast("Your account was deleted.");
      router.push("/");
      router.refresh();
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.is("invalidCredentials") ? "That password isn't right." : userMessage(error),
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
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This can&apos;t be undone. Type <strong className="text-foreground">{identifier}</strong> to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="delete-email" label={user.email ? "Your email" : "Your phone number"}>
            <Input
              id="delete-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              className="h-11 rounded-xl"
            />
          </Field>
          {user.has_password && (
            <Field id="delete-password" label="Your password">
              <PasswordInput
                id="delete-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-11 rounded-xl"
              />
            </Field>
          )}
          {problem && (
            <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-3 py-2.5 text-sm">
              {problem}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep my account
          </Button>
          <Button variant="destructive" disabled={!ready || remove.isPending} onClick={() => void confirm()} className="rounded-full">
            {remove.isPending && <Loader2 className="animate-spin" />} Delete account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
