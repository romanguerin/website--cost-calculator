// src/lib/seo.ts
import seoJson from '@/config/seo.json';

type Lang = 'en' | 'fr' | 'nl';
type LocaleConfig = {
  path: string;
  title: string;
  description: string;
  h1?: string;
  h2?: string;
  h3?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  ogImage?: string;
};

type SEOJson = {
  brand: string;
  siteUrl: string; // no trailing slash preferred
  locales: Record<Lang, LocaleConfig>;
};

const SEO: SEOJson = seoJson as any;
export const DEFAULT_LANG: Lang = 'en';
export const SUPPORTED_LANGS: Lang[] = ['en', 'fr', 'nl'];

/** Normalize any input to a supported Lang (falls back to DEFAULT_LANG). */
export function normalizeLang(input?: string | null): Lang {
  const val = (input || '').toLowerCase();
  return (SUPPORTED_LANGS as string[]).includes(val) ? (val as Lang) : DEFAULT_LANG;
}

/** Returns the locale config, falling back to DEFAULT_LANG when missing pieces. */
export function getLocaleConfig(lang: Lang): LocaleConfig {
  const primary = SEO.locales[lang];
  const fallback = SEO.locales[DEFAULT_LANG];
  return {
    path: primary?.path || fallback.path,
    title: primary?.title || fallback.title,
    description: primary?.description || fallback.description,
    h1: primary?.h1 || fallback.h1,
    h2: primary?.h2 || fallback.h2,
    h3: primary?.h3 || fallback.h3,
    ogTitle: primary?.ogTitle || primary?.title || fallback.ogTitle || fallback.title,
    ogDescription: primary?.ogDescription || primary?.description || fallback.ogDescription || fallback.description,
    twitterTitle: primary?.twitterTitle || primary?.title || fallback.twitterTitle || fallback.title,
    twitterDescription: primary?.twitterDescription || primary?.description || fallback.twitterDescription || fallback.description,
    ogImage: primary?.ogImage || fallback.ogImage,
  };
}

/** Builds an absolute URL from a path segment (handles leading/trailing slashes). */
export function absoluteUrl(path: string): string {
  const base = SEO.siteUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Swap or prefix the language in any pathname.
 * Examples:
 *  swapLangInPath('/en/pricing', 'fr')  -> '/fr/pricing'
 *  swapLangInPath('/pricing', 'nl')     -> '/nl/pricing'
 *  swapLangInPath('/', 'en')            -> '/en'
 */
export function swapLangInPath(pathname: string, nextLang: Lang): string {
  const clean = pathname || '/';
  const replaced = clean.replace(/^\/(en|fr|nl)(?=\/|$)/, `/${nextLang}`);
  if (/^\/(en|fr|nl)(?=\/|$)/.test(clean)) return replaced;
  // No locale prefix present → prefix it
  return `/${nextLang}${clean === '/' ? '' : clean}`;
}

/**
 * Build localized URLs map for <link rel="alternate" hreflang="..."> including x-default.
 * If you pass a pagePath like '/pricing', it will be appended to each locale base path.
 */
export function getAlternateLanguageUrls(pagePath = ''): Record<string, string> {
  const suffix = pagePath && pagePath !== '/' ? (pagePath.startsWith('/') ? pagePath : `/${pagePath}`) : '';
  const map: Record<string, string> = {};
  (SUPPORTED_LANGS as Lang[]).forEach((l) => {
    const base = getLocaleConfig(l).path.replace(/\/+$/, '');
    map[l] = absoluteUrl(`${base}${suffix}`);
  });
  // x-default points to the default language version
  const defBase = getLocaleConfig(DEFAULT_LANG).path.replace(/\/+$/, '');
  map['x-default'] = absoluteUrl(`${defBase}${suffix}`);
  return map;
}

/**
 * Build a Next.js Metadata-compatible object.
 * Use inside your route's generateMetadata or directly in a layout/page.
 *
 * Example:
 *   export function generateMetadata() {
 *     return buildMetadata('fr', { pagePath: '/pricing' });
 *   }
 */
export function buildMetadata(
  lang: Lang,
  opts?: {
    pagePath?: string;     // e.g. '/pricing' (relative to the locale root)
    titleOverride?: string;
    descriptionOverride?: string;
    noIndex?: boolean;
    ogImageOverride?: string;
  }
) {
  const l = normalizeLang(lang);
  const cfg = getLocaleConfig(l);

  const suffix = opts?.pagePath && opts.pagePath !== '/'
    ? (opts.pagePath.startsWith('/') ? opts.pagePath : `/${opts.pagePath}`)
    : '';

  const canonical = absoluteUrl(`${cfg.path.replace(/\/+$/, '')}${suffix}`);
  const alternates = getAlternateLanguageUrls(opts?.pagePath);

  const title = opts?.titleOverride || cfg.title;
  const description = opts?.descriptionOverride || cfg.description;
  const ogTitle = cfg.ogTitle || title;
  const ogDescription = cfg.ogDescription || description;
  const ogImage = opts?.ogImageOverride || cfg.ogImage;

  // Return a plain object to avoid importing Next types; it's shape-compatible.
  return {
    metadataBase: new URL(SEO.siteUrl),
    title,
    description,
    alternates: {
      canonical,
      languages: alternates, // { en: '...', fr: '...', nl: '...', 'x-default': '...' }
    },
    openGraph: {
      type: 'website',
      siteName: SEO.brand,
      url: canonical,
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [{ url: ogImage }] : undefined,
      locale: l,
    },
    twitter: {
      card: 'summary_large_image',
      title: cfg.twitterTitle || ogTitle,
      description: cfg.twitterDescription || ogDescription,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: {
      index: !opts?.noIndex,
      follow: !opts?.noIndex,
    },
  };
}

/** Convenience: page-level canonical (string) if you only need the URL. */
export function getCanonicalUrl(lang: Lang, pagePath = ''): string {
  const l = normalizeLang(lang);
  const cfg = getLocaleConfig(l);
  const suffix = pagePath && pagePath !== '/' ? (pagePath.startsWith('/') ? pagePath : `/${pagePath}`) : '';
  return absoluteUrl(`${cfg.path.replace(/\/+$/, '')}${suffix}`);
}

/**
 * Minimal JSON-LD Website schema (optional). Use in <script type="application/ld+json">.
 * You can pass a localized pagePath (e.g., '/pricing').
 */
export function buildWebsiteJsonLd(lang: Lang, pagePath = '') {
  const l = normalizeLang(lang);
  const url = getCanonicalUrl(l, pagePath);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SEO.brand,
    url,
    inLanguage: l,
  };
}
