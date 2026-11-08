"use client";

import { Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAsset, saveGuestSettings } from "@/app/admin/actions";
import { AssetUpload, IMAGE_ACCEPT } from "@/components/admin/asset-upload";
import { ColorRow, isHex, SliderRow, SwitchRow } from "@/components/admin/controls";
import { GuestApp } from "@/components/guest/guest-app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AssetItem } from "@/lib/admin-data";
import type { GuestPageSettings } from "@/lib/settings-types";

export function GuestSettings({ initial, eventName, images: initialImages, strip }: { initial: GuestPageSettings; eventName: string; images: AssetItem[]; strip: string[] }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [images, setImages] = useState(initialImages);
  const [pending, start] = useTransition();
  const set = <K extends keyof GuestPageSettings>(k: K, v: GuestPageSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = saved !== JSON.stringify(s);
  const byId = (id: string | null) => images.find((a) => a.id === id) ?? null;

  const save = () =>
    start(async () => {
      const r = await saveGuestSettings(s);
      if (!r.ok) toast.error(r.error);
      else {
        setSaved(JSON.stringify(s));
        toast.success("Saved. Guests see it the next time the page loads.");
      }
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end gap-2">
          {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
          <Button size="sm" variant="outline" disabled={!dirty || pending} onClick={() => setS(JSON.parse(saved))}>
            Discard
          </Button>
          <Button size="sm" disabled={!dirty || pending} onClick={save}>
            Save
          </Button>
        </div>
        <Card className="gap-4 py-4">
          <CardHeader>
            <CardTitle>Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <SwitchRow label="Accept new photos" hint="Turn off to close uploads after the event. The page stays up." checked={s.open} onChange={(v) => set("open", v)} />
              <SwitchRow label="Choose from the photo library" checked={s.library} onChange={(v) => set("library", v)} />
              <SwitchRow label="Take a photo with the camera" checked={s.camera} onChange={(v) => set("camera", v)} />
              <SwitchRow label="Caption required" checked={s.captionRequired} onChange={(v) => set("captionRequired", v)} />
              <SwitchRow label="Approve automatically" hint="Photos go straight to the wall with no review. Only for trusted crowds." checked={s.autoApprove} onChange={(v) => set("autoApprove", v)} />
              <SliderRow label="Photos per guest" min={1} max={100} value={s.perGuest} onChange={(v) => set("perGuest", v)} />
              <SwitchRow label="Show a countdown when a photo is about to appear" hint="Only on the primary wall." checked={s.countdown} onChange={(v) => set("countdown", v)} />
              <SwitchRow label="Link to the gallery of approved photos" checked={s.gallery} onChange={(v) => set("gallery", v)} />
            </FieldGroup>
          </CardContent>
        </Card>
        <Card className="gap-4 py-4">
          <CardHeader>
            <CardTitle>Words and colors</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="g-headline">Headline</FieldLabel>
                <Input id="g-headline" maxLength={80} value={s.headline} onChange={(e) => set("headline", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="g-intro">Intro</FieldLabel>
                <Textarea id="g-intro" maxLength={400} rows={3} value={s.intro} onChange={(e) => set("intro", e.target.value)} />
              </Field>
              <ColorRow label="Button color" value={s.buttonColor} onChange={(v) => isHex(v) && set("buttonColor", v)} />
            </FieldGroup>
          </CardContent>
        </Card>
        <Card className="gap-4 py-4">
          <CardHeader>
            <CardTitle>Header and logos</CardTitle>
            <CardDescription>Upload PNG or SVG logos. They’re stored in your bucket.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Header</FieldLabel>
                <ToggleGroup type="single" variant="outline" size="sm" value={s.header} onValueChange={(v) => v && set("header", v as "strip" | "image")}>
                  <ToggleGroupItem value="strip">Strip of approved photos</ToggleGroupItem>
                  <ToggleGroupItem value="image">An image</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              {s.header === "image" && (
                <Field>
                  <FieldLabel>Header image</FieldLabel>
                  <Select value={s.headerAssetId ?? ""} onValueChange={(v) => set("headerAssetId", v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick an uploaded image" />
                    </SelectTrigger>
                    <SelectContent>
                      {images.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <SwitchRow label="Show logos" checked={s.showLogos} onChange={(v) => set("showLogos", v)} />
              {s.showLogos && (
                <>
                  <Field>
                    <FieldLabel>Where</FieldLabel>
                    <ToggleGroup type="single" variant="outline" size="sm" value={s.logoPosition} onValueChange={(v) => v && set("logoPosition", v as "top" | "bottom")}>
                      <ToggleGroupItem value="top">Top</ToggleGroupItem>
                      <ToggleGroupItem value="bottom">Bottom</ToggleGroupItem>
                    </ToggleGroup>
                  </Field>
                  <Field>
                    <FieldLabel>Logos (up to 3)</FieldLabel>
                    <ul className="flex flex-col gap-2">
                      {images.map((a) => {
                        const on = s.logoAssetIds.includes(a.id);
                        return (
                          <li key={a.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              aria-label={`Use ${a.name}`}
                              checked={on}
                              disabled={!on && s.logoAssetIds.length >= 3}
                              onChange={() => set("logoAssetIds", on ? s.logoAssetIds.filter((x) => x !== a.id) : [...s.logoAssetIds, a.id])}
                              className="size-4"
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.url} alt="" className="h-7 w-12 rounded bg-muted object-contain" />
                            <span className="min-w-0 flex-1 truncate">{a.name}</span>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Delete file"
                              onClick={() =>
                                start(async () => {
                                  if (!confirm(`Delete ${a.name}? It's removed from the design too.`)) return;
                                  const r = await deleteAsset(a.id);
                                  if (!r.ok) toast.error(r.error);
                                  else {
                                    setImages((xs) => xs.filter((x) => x.id !== a.id));
                                    setS((x) => ({ ...x, logoAssetIds: x.logoAssetIds.filter((i) => i !== a.id), headerAssetId: x.headerAssetId === a.id ? null : x.headerAssetId }));
                                  }
                                })
                              }
                            >
                              <Trash2Icon />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </Field>
                </>
              )}
              <div>
                <AssetUpload accept={IMAGE_ACCEPT} label="Upload logo or header" onUploaded={(a) => setImages((xs) => [...xs, a])} />
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col items-center gap-2 xl:sticky xl:top-6 xl:self-start">
        <div className="h-[720px] w-[360px] overflow-hidden rounded-[2.5rem] border-[10px] border-zinc-900 bg-background shadow-xl">
          <div className="h-full overflow-y-auto">
            <GuestApp
              preview
              slug="preview"
              eventName={eventName}
              settings={s}
              logos={s.showLogos ? s.logoAssetIds.map(byId).filter((a): a is AssetItem => !!a).map((a) => ({ id: a.id, url: a.url, name: a.name })) : []}
              headerImage={s.header === "image" ? (byId(s.headerAssetId)?.url ?? null) : null}
              strip={s.header === "strip" ? strip : []}
              initialName=""
              initialPhotos={[]}
              used={0}
            />
          </div>
        </div>
        <span className="text-xs text-muted-foreground">Preview. Buttons don’t work here.</span>
      </div>
    </div>
  );
}
