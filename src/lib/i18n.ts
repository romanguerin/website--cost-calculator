// src/lib/i18n.ts
import strings from '@/config/strings.json';
import factorsI18n from '@/config/factors.i18n.json';

export type Lang = 'en' | 'nl' | 'fr';
const STR: Record<Lang, Record<string, any>> = strings as any;
const FX: any = factorsI18n;

export const DEFAULT_LANG: Lang = 'en';
export function isLang(x: string | undefined): x is Lang {
  return x === 'en' || x === 'nl' || x === 'fr';
}

/** UI strings already handled elsewhere (header, buttons) */
export function tUI(lang: Lang, key: string, fallback = ''): string {
  return (STR as any)?.[lang]?.[key] ?? fallback;
}

/** Group i18n: { label, help } */
export function tGroup(lang: Lang, groupId: string) {
  return FX?.[lang]?.ui?.groups?.[groupId] ?? {};
}

/** Lever i18n: { label, help, unit?, options?: Record<value,string> } */
export function tLever(lang: Lang, leverId: string) {
  return FX?.[lang]?.levers?.[leverId] ?? {};
}

export function tOptionLabel(lang: Lang, leverId: string, value: string, fallback?: string) {
  return FX?.[lang]?.levers?.[leverId]?.options?.[value] ?? fallback ?? value;
}

/** Rate help by role */
export function tRateHelp(lang: Lang, role: string, fallback = ''): string {
  return FX?.[lang]?.rateHelp?.[role] ?? fallback;
}

/** Preset label by id */
export function tPresetLabel(lang: Lang, presetId: string, fallback?: string) {
  return FX?.[lang]?.presets?.[presetId] ?? (fallback ?? presetId);
}

/** Assumptions / Exclusions lists */
export function getAssumptions(lang: Lang): string[] {
  return FX?.[lang]?.assumptions ?? [];
}
export function getExclusions(lang: Lang): string[] {
  return FX?.[lang]?.exclusions ?? [];
}
