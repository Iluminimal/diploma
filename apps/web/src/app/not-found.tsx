import { LostPage } from "@/components/layout/lost-page";

export default function NotFound() {
  return (
    <LostPage mark="404" title="We couldn't find that page">
      The product may have been removed, or the link is mistyped. Try a search, or start from one of these.
    </LostPage>
  );
}
