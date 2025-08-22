import './globals.css';
import type { Metadata } from 'next';
import seo from '@/config/seo.json';
import { isLang, DEFAULT_LANG, type Lang } from '@/lib/i18n';


export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
const lang = isLang(params.lang) ? (params.lang as Lang) : DEFAULT_LANG;
const siteUrl = seo.siteUrl || 'https://example.com';
const loc = seo.locales[lang];


const alternates: Record<string, string> = {};
(Object.keys(seo.locales) as Lang[]).forEach((k) => {
alternates[k] = siteUrl + seo.locales[k].path;
});


return {
metadataBase: new URL(siteUrl),
title: loc.title,
description: loc.description,
alternates: {
canonical: siteUrl + loc.path,
languages: alternates,
},
openGraph: {
title: loc.ogTitle,
description: loc.ogDescription,
url: loc.path,
siteName: seo.brand,
images: [{ url: loc.ogImage }],
locale: lang,
type: 'website',
},
twitter: {
card: 'summary_large_image',
title: loc.twitterTitle,
description: loc.twitterDescription,
images: [loc.ogImage],
},
};
}


export default function RootLayout({ children, params }: { children: React.ReactNode; params: { lang: string } }) {
const lang = isLang(params.lang) ? (params.lang as Lang) : DEFAULT_LANG;
return (
<html lang={lang}>
<body>{children}</body>
</html>
);
}