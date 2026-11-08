"use client";

import { useId } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/** A labelled slider that shows its value. */
export function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
}) {
  const id = useId();
  return (
    <Field>
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{format(value)}</span>
      </div>
      <Slider id={id} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

export function SwitchRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {hint && <FieldDescription>{hint}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Field>
  );
}

export function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          maxLength={7}
          className="font-mono"
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
        />
      </div>
    </Field>
  );
}

export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
