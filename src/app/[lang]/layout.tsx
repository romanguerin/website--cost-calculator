// app/[lang]/layout.tsx
export const runtime = 'edge';

import "./../globals.css";            // ✅ make sure this path matches your setup
import type { Metadata } from "next";
import seo from "@/config/seo.json";
import { isLang, DEFAULT_LANG, type Lang } from "@/lib/i18n";

type Params = { lang: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { lang: raw } = await params;                // ✅ await params (Next.js requirement)
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;

  const siteUrl = (seo as any).siteUrl?.replace(/\/+$/, "") || "https://example.com";
  const loc = (seo as any).locales?.[lang] ?? (seo as any).locales?.[DEFAULT_LANG];

  const languages: Record<string, string> = {};
  Object.entries((seo as any).locales || {}).forEach(([k, v]: any) => {
    languages[k] = siteUrl + v.path;
  });
  if ((seo as any).locales?.[DEFAULT_LANG]) {
    languages["x-default"] = siteUrl + (seo as any).locales[DEFAULT_LANG].path;
  }

  return {
    metadataBase: new URL(siteUrl),
    title: loc?.title,
    description: loc?.description,
    alternates: { canonical: siteUrl + (loc?.path || `/${lang}`), languages },
    openGraph: {
      type: "website",
      siteName: (seo as any).brand,
      url: loc?.path || `/${lang}`,
      title: loc?.ogTitle || loc?.title,
      description: loc?.ogDescription || loc?.description,
      images: loc?.ogImage ? [{ url: loc.ogImage }] : undefined,
      locale: lang,
    },
    twitter: {
      card: "summary_large_image",
      title: loc?.twitterTitle || loc?.title,
      description: loc?.twitterDescription || loc?.description,
      images: loc?.ogImage ? [loc.ogImage] : undefined,
    },
  };
}

export default async function RootLayout(
  { children, params }: { children: React.ReactNode; params: Promise<Params> }
) {
  const { lang: raw } = await params;                // ✅ await params
  const lang: Lang = isLang(raw) ? (raw as Lang) : DEFAULT_LANG;

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
  
}

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }, { lang: 'nl' }];
}

