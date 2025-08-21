import type { Metadata } from "next";
import strings from "@/config/strings.json";

export type Lang = "en" | "nl" | "fr";
export const SUPPORTED_LANGS: Lang[] = ["en", "nl", "fr"];

export function seoFor(lang: Lang, baseUrl = "https://codecost.io"): Metadata {
  const T = (strings as any)[lang];
  const languages: Record<string, string> = {
    en: "/en",
    nl: "/nl",
    fr: "/fr"
  };
  return {
    metadataBase: new URL(baseUrl),
    title: `${T.brand} — ${T.h1}`,
    description: T.metaDesc,
    alternates: {
      canonical: lang === "en" ? "/" : `/${lang}`,
      languages: {
        "en": "/en",
        "nl": "/nl",
        "fr": "/fr"
      }
    },
    openGraph: {
      type: "website",
      url: lang === "en" ? "/" : `/${lang}`,
      siteName: T.brand,
      title: `${T.brand} — ${T.h1}`,
      description: T.metaDesc
    },
    twitter: {
      card: "summary",
      title: `${T.brand} — ${T.h1}`,
      description: T.metaDesc
    }
  };
}
