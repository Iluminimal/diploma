import "server-only";
import { notFound } from "next/navigation";
import { getCatalogNav } from "./api";
import { findTrail } from "./nav";

/** The category a /c/... URL names, or a 404. Shared by the segment layout and the page. */
export async function resolveTrail(params: Promise<{ department: string; path?: string[] }>) {
  const { department, path } = await params;
  const trail = findTrail(await getCatalogNav(), department, path);
  if (!trail) notFound();
  return trail;
}
