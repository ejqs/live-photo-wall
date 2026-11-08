import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { CopyBrief } from "@/components/admin/copy-brief";
import { PageHeader } from "@/components/admin/page-header";
import { HELP } from "@/content/help";
import { cn } from "@/lib/utils";
import { aiBrief } from "@/wallmotion";

export const metadata: Metadata = { title: "Help" };

const PROSE =
  "max-w-2xl text-sm leading-6 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5";

export default async function HelpPage({ params }: PageProps<"/admin/help/[[...slug]]">) {
  const { slug } = await params;
  const current = slug?.[0] ?? null;
  const page = current ? HELP.find((p) => p.slug === current) : null;
  if (current && !page) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={page ? page.title : "Help & docs"} description={page?.summary} />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Help topics" className="flex flex-col gap-0.5 text-sm">
          {HELP.map((p) => (
            <Link key={p.slug} href={`/admin/help/${p.slug}`} className={cn("rounded-md px-2.5 py-1.5 hover:bg-accent", p.slug === current && "bg-accent font-medium")}>
              {p.title}
            </Link>
          ))}
        </nav>
        {page ? (
          <article className="flex flex-col gap-4">
            <div className={PROSE} dangerouslySetInnerHTML={{ __html: await marked.parse(page.body) }} />
            {page.slug === "motion" && (
              <div className="flex max-w-2xl flex-col gap-2">
                <CopyBrief text={aiBrief()} />
                <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">{aiBrief()}</pre>
              </div>
            )}
          </article>
        ) : (
          <ul className="grid max-w-3xl gap-3 sm:grid-cols-2">
            {HELP.map((p) => (
              <li key={p.slug}>
                <Link href={`/admin/help/${p.slug}`} className="flex h-full flex-col gap-1 rounded-lg border bg-card p-4 hover:bg-accent">
                  <strong className="text-sm">{p.title}</strong>
                  <span className="text-sm text-muted-foreground">{p.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
