import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileView } from "@/features/account/profile-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.meta");
  return { title: t("profile") };
}

export default function ProfilePage() {
  return <ProfileView />;
}
