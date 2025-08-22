// app/[lang]/privacy/page.tsx
import type { Metadata } from "next";
import { DEFAULT_LANG, isLang, type Lang } from "@/lib/i18n";
import seo from "@/config/seo.json";
import privacy from "@/config/privacy.json";
import Link from "next/link";


type Params = { lang: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;

  const siteUrl = (seo as any).siteUrl?.replace(/\/+$/, "") || "https://example.com";
  const route = "privacy";
  const t = (privacy as any)[lang]?.seo ?? (privacy as any)[DEFAULT_LANG].seo;

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

export default async function PrivacyPage(
  { params }: { params: Promise<Params> }
) {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;
  const t = (privacy as any)[lang] ?? (privacy as any)[DEFAULT_LANG];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
      <p className="mt-2 text-sm text-neutral-500">{t.updated}</p>
      <ul className="mt-6 list-disc pl-6 space-y-2">
        {t.items.map((li: string, i: number) => <li key={i}>{li}</li>)}
      </ul>
      <Link
        href={`/${lang}`}
        className="inline-block text-2xl px-4 py-8 hover:text-gray-300"
      >
        ←
      </Link>
    </main>
  );
}
