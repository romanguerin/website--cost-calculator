export type Lang = 'en' | 'fr' | 'nl';
export const SUPPORTED_LANGS: Lang[] = ['en','fr','nl'];
export const isLang = (v: string): v is Lang => (['en','fr','nl'] as const).includes(v as any);
export const DEFAULT_LANG: Lang = 'en';