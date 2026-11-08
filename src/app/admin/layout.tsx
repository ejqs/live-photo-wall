import { getSetting } from "@/lib/settings";
import { pendingCount } from "@/lib/photos";
import { requirePage } from "@/lib/session";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePage("moderator");
  const [event, pending] = await Promise.all([getSetting("event"), pendingCount()]);
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40 md:flex-row print:bg-white">
      <AdminNav me={me} eventName={event.name} pending={pending} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-9 md:py-7 print:p-0">{children}</main>
    </div>
  );
}
