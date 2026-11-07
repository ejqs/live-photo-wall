export function LinkExpired({ eventName }: { eventName: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-[family-name:var(--font-display)] text-3xl tracking-wide uppercase">{eventName}</p>
      <h1 className="text-xl font-semibold">This link has changed</h1>
      <p className="text-muted-foreground">Scan the QR code on the wall or on your table again to add your photo.</p>
    </main>
  );
}
