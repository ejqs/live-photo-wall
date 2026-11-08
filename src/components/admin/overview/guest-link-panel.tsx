"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { rotateGuestLink, setUploadsOpen } from "@/app/admin/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function GuestLinkPanel({ url, open, canEdit }: { url: string; open: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Guest upload QR</CardTitle>
        <CardDescription>The QR on the walls and table cards points here.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">{url}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              toast.success("Link copied");
            }}
          >
            Copy
          </Button>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/qr-cards" target="_blank">
                Print table cards
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={pending}>
                  Rotate link
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rotate the guest link?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Walls show the new QR within seconds. The old link keeps working for 30 minutes, then stops. Printed table cards with the old QR will stop working too.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      start(async () => {
                        const r = await rotateGuestLink(30);
                        if (r.ok) toast.success("New link is live.");
                        else toast.error(r.error);
                      })
                    }
                  >
                    Rotate link
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="ml-auto flex items-center gap-2">
              <Switch
                id="uploads-open"
                checked={open}
                disabled={pending}
                onCheckedChange={(v) =>
                  start(async () => {
                    const r = await setUploadsOpen(v);
                    if (!r.ok) toast.error(r.error);
                  })
                }
              />
              <Label htmlFor="uploads-open">Accept guest uploads</Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
