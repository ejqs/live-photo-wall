"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/session";

const ITEMS: { href: string; label: string; min: Me["role"] }[] = [
  { href: "/admin", label: "Overview", min: "moderator" },
  { href: "/admin/photos", label: "Photos", min: "moderator" },
  { href: "/admin/design", label: "Design", min: "admin" },
  { href: "/admin/motion", label: "Motion & timing", min: "admin" },
  { href: "/admin/guest", label: "Guest page", min: "admin" },
  { href: "/admin/walls", label: "Walls", min: "admin" },
  { href: "/admin/landing", label: "Landing page", min: "admin" },
  { href: "/admin/team", label: "Team", min: "owner" },
  { href: "/admin/settings", label: "Event settings", min: "admin" },
];
const RANK = { moderator: 1, admin: 2, owner: 3 } as const;

export function AdminNav({ me, eventName, pending: initialPending }: { me: Me; eventName: string; pending: number }) {
  const path = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);

  const [prevInitial, setPrevInitial] = useState(initialPending);
  if (prevInitial !== initialPending) {
    setPrevInitial(initialPending);
    setPending(initialPending);
  }
  useEffect(() => {
    const es = new EventSource("/api/admin/events");
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data);
        if (e.type === "queue") setPending(e.pending);
      } catch {}
    };
    return () => es.close();
  }, []);

  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav aria-label="Admin" className="print:hidden flex shrink-0 flex-col gap-1 border-b bg-background px-3.5 py-4 md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0 md:py-5">
      <div className="flex flex-col px-2 pb-4">
        <strong className="text-sm">Live Photo Wall</strong>
        <span className="truncate text-xs text-muted-foreground">{eventName}</span>
      </div>
      <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {ITEMS.filter((i) => RANK[me.role] >= RANK[i.min]).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm whitespace-nowrap hover:bg-accent",
              active(i.href) && "bg-accent font-semibold",
            )}
          >
            {i.label}
            {i.href === "/admin/photos" && pending > 0 && <Badge>{pending}</Badge>}
          </Link>
        ))}
      </div>
      <div className="hidden grow md:block" />
      <div className="flex gap-1 md:flex-col">
        <Link href="/admin/help" className={cn("rounded-md px-2.5 py-2 text-sm hover:bg-accent", active("/admin/help") && "bg-accent font-semibold")}>
          Help &amp; docs
        </Link>
        <div className="flex items-center justify-between gap-2 px-2.5 pt-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{me.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{me.role}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await authClient.signOut();
              router.replace("/sign-in");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
}
