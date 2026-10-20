"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthActions } from "./use-auth-actions";

/** Үйлчлүүлэгчийг гаргаж, мэдэгдэж, нүүр хуудас руу аваачна: аль дэлгэцээс ч адилхан. */
export function useSignOut() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  return async () => {
    try {
      await signOut();
      toast("You're signed out.");
    } catch {
      toast.error("We couldn't reach the server, but you're signed out on this device.");
    }
    router.push("/");
    router.refresh();
  };
}
