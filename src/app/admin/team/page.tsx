import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { TeamManager } from "@/components/admin/team-manager";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Role } from "@/lib/auth";
import { requirePage } from "@/lib/session";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requirePage("owner");
  const rows = await db.select().from(user).orderBy(asc(user.createdAt));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Team" />
      <TeamManager meId={me.id} members={rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role as Role, createdAt: u.createdAt.getTime() }))} />
    </div>
  );
}
