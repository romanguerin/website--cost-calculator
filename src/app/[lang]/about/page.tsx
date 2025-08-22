// app/[lang]/about/page.tsx
export const runtime = 'edge';

import type { Metadata } from "next";
import { DEFAULT_LANG, isLang, type Lang } from "@/lib/i18n";
import seo from "@/config/seo.json";
import about from "@/config/about.json";
import Link from "next/link";


type Params = { lang: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;

  const siteUrl = (seo as any).siteUrl?.replace(/\/+$/, "") || "https://example.com";
  const route = "about";
  const t = (about as any)[lang]?.seo ?? (about as any)[DEFAULT_LANG].seo;

  // hreflang for this route
  const languages: Record<string, string> = {};
  Object.keys((seo as any).locales || {}).forEach((k) => {
    languages[k] = `${siteUrl}/${k}/${route}`;
  });
  languages["x-default"] = `${siteUrl}/${DEFAULT_LANG}/${route}`;

  return {
    metadataBase: new URL(siteUrl),
    title: t.title,
    description: t.description,
    alternates: {
      canonical: `${siteUrl}/${lang}/${route}`,
      languages
    },
    openGraph: {
      type: "article",
      siteName: (seo as any).brand,
      url: `/${lang}/${route}`,
      title: t.title,
      description: t.description
    },
    twitter: {
      card: "summary",
      title: t.title,
      description: t.description
    }
  };
}

export default async function AboutPage(
  { params }: { params: Promise<Params> }
) {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;
  const t = (about as any)[lang] ?? (about as any)[DEFAULT_LANG];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-300">{t.lede}</p>
      <div className="mt-6 space-y-4 text-neutral-700 dark:text-neutral-200">
        {t.body.map((p: string, i: number) => <p key={i}>{p}</p>)}
      </div>
      <Link
        href={`/${lang}`}
        className="inline-block text-2xl px-4 py-8 hover:text-gray-300"
      >
        ←
      </Link>
    </main>
  );
}
