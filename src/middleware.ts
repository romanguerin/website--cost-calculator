import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';


const SUPPORTED = new Set(['en','fr','nl']);
const DEFAULT_LANG = 'en';


export function middleware(req: NextRequest) {
const { pathname } = req.nextUrl;


// Ignore _next, assets, API, and files
if (
pathname.startsWith('/_next') ||
pathname.startsWith('/api') ||
pathname.includes('.')
) return NextResponse.next();


// If path is "/" → redirect to default /en
if (pathname === '/') {
const url = req.nextUrl.clone();
url.pathname = `/${DEFAULT_LANG}`;
return NextResponse.redirect(url);
}


// If first segment is not a supported lang, you can either:
// A) let Next handle 404 (do nothing), or
// B) rewrite to default. We'll do A (safer for future routes).
const seg1 = pathname.split('/')[1];
if (seg1 && !SUPPORTED.has(seg1)) return NextResponse.next();


return NextResponse.next();
}


export const config = {
matcher: ['/((?!_next|.*\\..*).*)'],
};