// app/[lang]/terms/page.tsx
export const runtime = 'edge';

import type { Metadata } from "next";
import { DEFAULT_LANG, isLang, type Lang } from "@/lib/i18n";
import seo from "@/config/seo.json";
import terms from "@/config/terms.json";
import Link from "next/link";

type Params = { lang: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;

  const siteUrl = (seo as any).siteUrl?.replace(/\/+$/, "") || "https://example.com";
  const route = "terms";
  const t = (terms as any)[lang]?.seo ?? (terms as any)[DEFAULT_LANG].seo;

  const languages: Record<string, string> = {};
  Object.keys((seo as any).locales || {}).forEach((k) => {
    languages[k] = `${siteUrl}/${k}/${route}`;
  });
  languages["x-default"] = `${siteUrl}/${DEFAULT_LANG}/${route}`;

  return {
    metadataBase: new URL(siteUrl),
    title: t.title,
    description: t.description,
    alternates: { canonical: `${siteUrl}/${lang}/${route}`, languages }
  };
}

export default async function TermsPage(
  { params }: { params: Promise<Params> }
) {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;
  const t = (terms as any)[lang] ?? (terms as any)[DEFAULT_LANG];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
      <ul className="mt-6 list-disc pl-6 space-y-2">
        {t.items.map((li: string, i: number) => <li key={i}>{li}</li>)}
      </ul>
            {/* Back button */}
    <Link
        href={`/${lang}`}
        className="inline-block text-2xl px-4 py-8 hover:text-gray-300"
      >
        ←
      </Link>
    </main>
  );
}
