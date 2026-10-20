import "server-only";
import { notFound } from "next/navigation";
import { getCatalogNav } from "./api";
import { findTrail } from "./nav";

/** /c/... URL-ийн нэрлэсэн ангилал, эсвэл 404. Segment layout ба хуудас хоёр хуваалцана. */
export async function resolveTrail(params: Promise<{ department: string; path?: string[] }>) {
  const { department, path } = await params;
  const trail = findTrail(await getCatalogNav(), department, path);
  if (!trail) notFound();
  return trail;
}
