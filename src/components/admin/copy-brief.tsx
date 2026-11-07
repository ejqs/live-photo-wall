"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyBrief({ text }: { text: string }) {
  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          toast.success("Copied");
        }}
      >
        <CopyIcon data-icon="inline-start" />
        Copy AI instructions
      </Button>
    </div>
  );
}
