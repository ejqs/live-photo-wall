import "server-only";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { exportsTable } from "@/db/schema";

/** The newest finished wall video that still has a file, for the landing page. */
export async function latestVideo() {
  const [row] = await db
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.kind, "mp4"), eq(exportsTable.status, "done"), isNotNull(exportsTable.key), gt(exportsTable.expiresAt, new Date())))
    .orderBy(desc(exportsTable.finishedAt))
    .limit(1);
  return row ?? null;
}
