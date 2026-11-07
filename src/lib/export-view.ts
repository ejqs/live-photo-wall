export type ExportView = {
  id: string;
  status: string;
  progress: number;
  bytes: number | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  expiresAt: number | null;
  options: Record<string, unknown>;
};

export function serializeExport(e: {
  id: string;
  status: string;
  progress: number;
  bytes: number | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  expiresAt: Date | null;
  options: Record<string, unknown>;
}): ExportView {
  return {
    id: e.id,
    status: e.status,
    progress: e.progress,
    bytes: e.bytes,
    error: e.error,
    createdAt: e.createdAt.getTime(),
    finishedAt: e.finishedAt?.getTime() ?? null,
    expiresAt: e.expiresAt?.getTime() ?? null,
    options: e.options,
  };
}
