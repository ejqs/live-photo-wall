"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addTeamMember, removeTeamMember, resetTeamPassword, setTeamRole } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/lib/auth";

type Member = { id: string; name: string; email: string; role: Role; createdAt: number };

const ROLE_HINT: Record<Role, string> = {
  owner: "Everything, including the team.",
  admin: "Everything except the team: design, motion, walls, settings, exports.",
  moderator: "Approves and removes photos. Good for helpers at the event.",
};

function randomPassword() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => a[b % a.length]).join("");
}

export function TeamManager({ members, meId }: { members: Member[]; meId: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: randomPassword(), role: "moderator" as Role });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Team</CardTitle>
            <CardDescription>There’s no public sign-up. You create each account and share the password yourself.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add someone</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a team member</DialogTitle>
                <DialogDescription>Copy the password before you close this. They can sign in right away.</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="t-name">Name</FieldLabel>
                  <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-email">Email</FieldLabel>
                  <Input id="t-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-pw">Password</FieldLabel>
                  <div className="flex gap-2">
                    <Input id="t-pw" className="font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(form.password).then(() => toast.success("Copied"))}>
                      Copy
                    </Button>
                  </div>
                  <FieldDescription>At least 10 characters.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Role</FieldLabel>
                  <Select value={form.role} onValueChange={(role) => setForm({ ...form, role: role as Role })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>{ROLE_HINT[form.role]}</FieldDescription>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await addTeamMember(form);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success(`Added ${form.name}`);
                      setOpen(false);
                      setForm({ name: "", email: "", password: randomPassword(), role: "moderator" });
                    })
                  }
                >
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {m.name}
                        {m.id === meId && " (you)"}
                      </span>
                      <span className="text-xs text-muted-foreground">{m.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.role === "owner" || m.id === meId ? (
                      <span className="capitalize">{m.role}</span>
                    ) : (
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          start(async () => {
                            const r = await setTeamRole(m.id, role as Role);
                            if (!r.ok) toast.error(r.error);
                          })
                        }
                      >
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="moderator">Moderator</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.id !== meId && m.role !== "owner" && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            const pw = randomPassword();
                            start(async () => {
                              const r = await resetTeamPassword(m.id, pw);
                              if (!r.ok) toast.error(r.error);
                              else {
                                navigator.clipboard?.writeText(pw).catch(() => {});
                                toast.success(`New password for ${m.name}: ${pw} (copied)`, { duration: 20000 });
                              }
                            });
                          }}
                        >
                          Reset password
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm(`Remove ${m.name}? They're signed out right away.`)) return;
                            start(async () => {
                              const r = await removeTeamMember(m.id);
                              if (!r.ok) toast.error(r.error);
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {(Object.keys(ROLE_HINT) as Role[]).map((r) => (
              <div key={r} className="contents">
                <dt className="font-medium capitalize">{r}</dt>
                <dd className="text-muted-foreground">{ROLE_HINT[r]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
