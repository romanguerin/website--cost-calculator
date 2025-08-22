"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { isLang, type Lang, getAssumptions, getExclusions, tRateHelp, tGroup, tLever, tOptionLabel, tPresetLabel } from '@/lib/i18n';
import ExportPdfDialog from "@/components/ExportPdfDialog";

import stringsJson from "@/config/strings.json";
import factorsJson from "@/config/factors.json";
import countriesJson from "@/config/countries.json";
import {
  computeEstimate,
  visibleLeverIdSet,
  applyPreset as applyPresetLib,
  getCountryBaseRates,
  type Selections,
  type Lever
} from "@/lib/estimate";

/* ---------- types, constants ---------- */

type Cfg = typeof factorsJson & typeof countriesJson;
type Role = "design" | "frontend" | "backend" | "pm" | "qa" | "devops" | "seo" | "content";
const SIMPLE_PRESET_ID = "offerte_simple_website";

const STR: Record<Lang, Record<string, string>> = stringsJson as any;

const DEFAULT_COUNTRY_BY_LANG: Record<Lang, string> = {
  en: "US",
  fr: "FR",
  nl: "NL",
};




// Short explanations shown beside each rate (help '?') come from i18n via tRateHelp

/* ---------- theme hook (system default) ---------- */

type Theme = "light" | "dark" | "system";
function useThemeDefault(): [Theme, (t: Theme) => void, boolean] {
  const [theme, setTheme] = useState<Theme>("system");
  const [isDark, setIsDark] = useState<boolean>(true);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const compute = (t: Theme) => (t === "dark" ? true : t === "light" ? false : !!mq?.matches);
    setIsDark(compute(theme));
    const listener = () => setIsDark(compute(theme));
    mq?.addEventListener?.("change", listener);
    return () => mq?.removeEventListener?.("change", listener);
  }, [theme]);

  return [theme, setTheme, isDark];
}

/* ---------- utils ---------- */

function fmtMoney(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function clamp(n: number, min?: number, max?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return min ?? 0;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}
function shallowEqual(a: Record<string, any>, b: Record<string, any>) {
  const ak = Object.keys(a); const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (Array.isArray(a[k]) && Array.isArray(b[k])) {
      if (a[k].length !== b[k].length) return false;
      for (let i = 0; i < a[k].length; i++) if (a[k][i] !== b[k][i]) return false;
    } else if (a[k] !== b[k]) return false;
  }
  return true;
}
function applyDependenciesUI(cfg: Cfg, base: Selections): { selections: Selections; hidden: Set<string> } {
  let selections = { ...base };
  const hidden = new Set<string>();
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const dep of (cfg as any).dependencies ?? []) {
      if (selections[dep.if.id] === dep.if.equals) {
        for (const id of dep.then?.hide ?? []) hidden.add(id);
        for (const adj of dep.then?.adjust ?? []) {
          if (selections[adj.id] !== adj.set) { selections = { ...selections, [adj.id]: adj.set }; changed = true; }
        }
      }
    }
    if (!changed) break;
  }
  return { selections, hidden };
}
function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ---------- main ---------- */

export default function Home() {
  const router = useRouter();
  const [showPdf, setShowPdf] = useState(false);
  const params = useParams<{ lang?: string }>();
  const [countryTouched, setCountryTouched] = useState(false);

  // compose config (split files)
  const cfg: Cfg = useMemo(() => ({ ...(factorsJson as any), ...(countriesJson as any) }), []);

  // language & theme (menu) — derive from URL, keep in sync with param
  const initialLang: Lang = isLang(params?.lang || "") ? (params!.lang as Lang) : "en";
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    if (isLang(params?.lang || "") && params!.lang !== lang) setLang(params!.lang as Lang);
  }, [params?.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const [theme, setTheme, isDark] = useThemeDefault();
  const T = STR[lang];

    // still inside Home(), after cfg/lang are known:
const initialCountry = useMemo(() => {
  return (
    cfg.countries.find((c: any) => c.code === DEFAULT_COUNTRY_BY_LANG[lang])?.code ??
    cfg.countries[0].code
  );
}, [cfg, lang]);

  const initialSelections: Selections = useMemo(() => {
    let s: Selections = {
      _country: initialCountry,                      // ✅ use mapped country
      _roleAdjust: {},
      _rateOverrides: {},
      _taxOverrides: {}
    };
    for (const l of cfg.levers as any[]) {
      const d = (l as any).default;
      if (d !== undefined) s[l.id] = d;
      if (l.type === "multiselect" && s[l.id] === undefined) s[l.id] = [];
    }
    const p = (cfg.presets ?? []).find((x: any) => x.id === SIMPLE_PRESET_ID);
    if (p) s = { ...s, ...p.values };               // leave _country as-is
    return s;
  }, [cfg, initialCountry]);
  
  const [selections, setSelections] = useState<Selections>(initialSelections);
  const [country, setCountry] = useState<string>(initialCountry);   // ✅
  const [presetId, setPresetId] = useState<string>(SIMPLE_PRESET_ID);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (countryTouched) return;
    setCountry(initialCountry);
  }, [initialCountry, countryTouched]);
  

  // sync country into selections
  useEffect(() => { setSelections(prev => ({ ...prev, _country: country })); }, [country]);

  // dependencies (UI)
  useEffect(() => {
    const adjusted = applyDependenciesUI(cfg as any, selections).selections;
    if (!shallowEqual(adjusted, selections)) setSelections(adjusted);
  }, [selections, cfg]);

  // visible levers
  const visibleIds = useMemo(() => visibleLeverIdSet(cfg as any, selections), [cfg, selections]);

  // estimate & country
  const result = useMemo(() => computeEstimate(cfg as any, selections), [cfg, selections]);
  const curr = result.currencySymbol;
  const countryObj = cfg.countries.find((c: any) => c.code === country)!;

  // presets
  const presetOptions = (cfg.presets ?? [])
  .slice()
  .sort((a: any, b: any) => (Number(a.meta?.order ?? 0) - Number(b.meta?.order ?? 0)))
  .map((p: any) => ({ value: p.id, label: tPresetLabel(lang, p.id, p.label) }));


  const applyPreset = (id: string) => {
    const next = applyPresetLib(cfg as any, selections, id);
    setSelections({ ...next, _roleAdjust: selections._roleAdjust ?? {}, _rateOverrides: selections._rateOverrides ?? {}, _taxOverrides: selections._taxOverrides ?? {} });
    setCountry(next._country || cfg.countries[0].code);
  };
  const onPresetChange = (id: string) => { setPresetId(id); if (id) applyPreset(id); };
  const onReset = () => {
    setPresetId(SIMPLE_PRESET_ID);
    const p = (cfg.presets ?? []).find((x: any) => x.id === SIMPLE_PRESET_ID);
    const base: Selections = { _country: country || cfg.countries[0].code, _roleAdjust: {}, _rateOverrides: {}, _taxOverrides: {} };
    for (const l of cfg.levers as any[]) {
      const d = (l as any).default;
      if (d !== undefined) base[l.id] = d;
      if (l.type === "multiselect" && base[l.id] === undefined) base[l.id] = [];
    }
    const next = p ? { ...base, ...p.values } : base;
    setSelections(next); setCountry(next._country);
  };

  /* ---------- render ---------- */

  return (
    <main className={cx("min-h-screen transition-colors", isDark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900")}>
      {/* Top navigation: Language / Theme / Login */}
      <nav className={cx("sticky top-0 z-40 backdrop-blur border-b",
        isDark ? "bg-neutral-950/60 border-neutral-900" : "bg-white/70 border-neutral-200")}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cx("h-2 w-2 rounded-full", isDark ? "bg-neutral-300" : "bg-neutral-800")}></span>
            <span className="font-medium">CodeCost</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-medium">友</span>
            <SelectFancy
              ariaLabel={T.language}
              value={lang}
              onChange={(v) => {
                const next = (v as Lang);
                setLang(next);
                // stay on the same page and just switch locale prefix
                router.replace(`/${next}`);
              }}
              options={[
                { value: "en", label: "EN" },
                { value: "nl", label: "NL" },
                { value: "fr", label: "FR" }
              ]}
              isDark={isDark}
              widthClass="w-[72px]"
            />
            <span className="ml-4 font-medium">☀︎</span>
            <SelectFancy
              ariaLabel={T.theme}
              value={theme}
              onChange={(v) => setTheme(v as Theme)}
              options={[{ value: "system", label: T.system }, { value: "light", label: T.light }, { value: "dark", label: T.dark }]}
              isDark={isDark}
              widthClass="w-[120px]"
            />
            {/* <Button variant="solid" onClick={() => setShowLogin(true)} isDark={isDark}>{T.login}</Button> */}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        {/* Page header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{T.title}</h1>
            <p className={cx("mt-2", isDark ? "text-neutral-400" : "text-neutral-600")}>{T.subtitle}</p>
          </div>

          {/* Secondary toolbar (estimator controls) */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <SelectFancy
              ariaLabel={T.country}
              value={country}
              onChange={(code) => { setCountryTouched(true); setCountry(code); }}   // 👈 touched
              options={cfg.countries.map((c: any) => ({ value: c.code, label: c.name }))}
              isDark={isDark}
            />

            <Button variant="outline" onClick={() => setShowRateModal(true)} isDark={isDark}>{T.editRates}</Button>
            {cfg.presets?.length ? (
              <SelectFancy
                ariaLabel={T.preset}
                value={presetId}
                onChange={onPresetChange}
                options={[{ value: "", label: T.custom }, ...presetOptions]}
                isDark={isDark}
                widthClass="w-[220px]"
              />
            ) : null}
            <Button variant="outline" onClick={onReset} isDark={isDark}>{T.reset}</Button>
          </div>
        </header>

        {/* Groups */}
        <div className="mt-6 sm:mt-8 space-y-8">
          {(cfg.ui?.groups ?? []).map((group: any) => {
            const levers = (cfg.levers as Lever[]).filter(l => (l as any).group === group.id && visibleIds.has(l.id));
            if (levers.length === 0) return null;
            return (
              <section key={group.id}>
                {(() => {
                    const G = tGroup(lang, group.id);
                    const groupTitle = G.label ?? group.id;
                    return <h2 className="text-lg sm:text-xl font-medium mb-3 sm:mb-4">{groupTitle}</h2>;
                  })()}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {levers.map((lever) => renderLeverCard(lever, selections, setSelections, isDark, lang))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Outputs */}
        <section className="mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <Card title={T.p50} isDark={isDark}>
            <BigNumber label="Hours" value={result.p50.hours.toFixed(1)} />
            <BigNumber label="Cost" value={`${curr}${fmtMoney(result.p50.cost)}`} />
          </Card>
          <Card title={T.p80} isDark={isDark}>
            <BigNumber label="Hours" value={result.p80.hours.toFixed(1)} />
            <BigNumber label="Cost" value={`${curr}${fmtMoney(result.p80.cost)}`} />
          </Card>
          <Card
            title={T.breakdown}
            action={<Button variant="outline" size="xs" onClick={() => setShowRoleModal(true)} isDark={isDark}>{STR[lang].edit}</Button>}
            isDark={isDark}
          >
            <ListRow label="Design" value={`${result.hoursByRole.design.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.design)})`} />
            <ListRow label="Frontend" value={`${result.hoursByRole.frontend.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.frontend)})`} />
            <ListRow label="Backend" value={`${result.hoursByRole.backend.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.backend)})`} />
            <ListRow label="Content" value={`${result.hoursByRole.content.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.content)})`} />
            <ListRow label="SEO" value={`${result.hoursByRole.seo.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.seo)})`} />
            <ListRow label="DevOps" value={`${result.hoursByRole.devops.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.devops)})`} />
            <div className={cx("mt-3 h-px", isDark ? "bg-neutral-800" : "bg-neutral-200")} />
            <ListRow label="PM (overhead)" value={`${result.overheads.pmHours.toFixed(1)} h (${curr}${fmtMoney(result.overheads.pmCost)})`} />
            <ListRow label="QA (overhead)" value={`${result.overheads.qaHours.toFixed(1)} h (${curr}${fmtMoney(result.overheads.qaCost)})`} />
          </Card>
        </section>

        {/* Export PDF */}
        <section className="mt-8 sm:mt-10 flex justify-center">
          <Button onClick={() => setShowPdf(true)} isDark={isDark}>Export PDF</Button>
        </section>

        <ExportPdfDialog
          open={showPdf}
          onClose={() => setShowPdf(false)}
          lang={lang}
          countryCode={country}
          selections={selections}
          result={{
            currencySymbol: result.currencySymbol,
            p50: result.p50,
            p80: result.p80,
            hoursByRole: result.hoursByRole as any,
            costByRole: result.costByRole as any,
            overheads: result.overheads,
          }}
        />

        {/* Assumptions / Exclusions */}
        <section className="mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title={T.assumptions} isDark={isDark}>
            <ul className={cx("list-disc pl-5 space-y-1 text-sm", isDark ? "text-neutral-300" : "text-neutral-700")}>
              {getAssumptions(lang).map((a: string, i: number) => <li key={i}>{a}</li>)}
            </ul>
          </Card>
          <Card title={T.exclusions} isDark={isDark}>
            <ul className={cx("list-disc pl-5 space-y-1 text-sm", isDark ? "text-neutral-300" : "text-neutral-700")}>
              {getExclusions(lang).map((e: string, i: number) => <li key={i}>{e}</li>)}
            </ul>
          </Card>
          
        </section>

        {/* Footer */}
        <footer className={cx("mt-10 sm:mt-12 border-t pt-6 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
          isDark ? "border-neutral-900 text-neutral-400" : "border-neutral-200 text-neutral-600"
        )}>
          <p className="max-w-xl">{T.pricesNote}</p>
          {/* in your footer */}
            <nav className="flex flex-wrap gap-4">
              <a href={`/${lang}/about`} className="underline-offset-4 hover:underline">{T.footerAbout}</a>
              <a href={`/${lang}/privacy`} className="underline-offset-4 hover:underline">{T.footerPrivacy}</a>
              <a href={`/${lang}/terms`} className="underline-offset-4 hover:underline">{T.footerTerms}</a>
            </nav>
        </footer>
        <p className="text-neutral-600 pt-6 flex flex-row justify-center items-center">all rights reserved by&nbsp;<a className="underline" href="alpine-pixel.com">AlpinePixel</a></p>
      </div>

      {/* Role Modal */}
      {showRoleModal && (
        <Modal onClose={() => setShowRoleModal(false)} title={T.modalRoleTitle} isDark={isDark}>
          <p className={cx("text-sm mb-3", isDark ? "text-neutral-400" : "text-neutral-600")}>{T.modalRoleHint}</p>
          <RoleEditor
            resultPreHours={result.debug.preAdjustHours}
            selections={selections}
            setSelections={setSelections}
            isDark={isDark}
            lang={lang}
          />
        </Modal>
      )}

      {/* Rate Editor */}
      {showRateModal && (
        <RateEditorModal
          config={cfg as any}
          countryCode={country}
          countryName={countryObj.name}
          selections={selections}
          currencySymbol={result.currencySymbol}
          onChange={setSelections}
          onClose={() => setShowRateModal(false)}
          isDark={isDark}
          lang={lang}
        />
      )}

      {/* Login (Demo) */}
      {showLogin && (
        <Modal onClose={() => setShowLogin(false)} title={T.login} isDark={isDark}>
          <p className={cx("text-sm", isDark ? "text-neutral-300" : "text-neutral-700")}>
            This is a demo. Authentication & persistence are planned for a future phase.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              type="email"
              placeholder="you@example.com"
              className={cx("w-full rounded-lg p-2 border",
                isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-300")}
            />
            <Button variant="solid" onClick={() => setShowLogin(false)} isDark={isDark}>OK</Button>
          </div>
        </Modal>
      )}
    </main>
  );
}

/* ---------- Role editor ---------- */

function RoleEditor({
  resultPreHours,
  selections,
  setSelections,
  isDark,
  lang
}: {
  resultPreHours: Record<string, number>;
  selections: Selections;
  setSelections: (fn: (s: Selections) => Selections) => void;
  isDark: boolean;
  lang: Lang;
}) {
  const roles: Role[] = ["design","frontend","backend","devops","seo","content"];
  return (
    <>
      <div className="space-y-3">
        {roles.map((role) => {
          const current = Number((resultPreHours as any)[role] ?? 0);
          const delta = Number((selections._roleAdjust as any)?.[role] ?? 0);
          const effective = current + delta;
          return (
            <div key={role} className="flex items-center justify-between gap-3">
              <div className="w-32 sm:w-36 capitalize">{role}</div>
              <div className="text-xs w-24 sm:w-28 text-neutral-500">base: {current.toFixed(1)} h</div>
              <Stepper
                value={delta}
                step={0.5}
                onChange={(v) => setSelections(s => ({ ...s, _roleAdjust: { ...(s._roleAdjust ?? {}), [role]: v } }))}
                isDark={isDark}
              />
              <div className="text-sm font-medium w-20 sm:w-24 text-right">{effective.toFixed(1)} h</div>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex justify-between">
        <Button variant="outline" onClick={() => setSelections(s => ({ ...s, _roleAdjust: {} }))} isDark={isDark}>
          {STR[lang].resetAdjust}
        </Button>
        <Button variant="solid" onClick={() => (document.activeElement as HTMLElement)?.blur()} isDark={isDark}>
          {STR[lang].done}
        </Button>
      </div>
    </>
  );
}

/* ---------- Rate Editor Modal (with '?' help) ---------- */

function RateEditorModal({
  config,
  countryCode,
  countryName,
  selections,
  currencySymbol,
  onChange,
  onClose,
  isDark,
  lang
}: {
  config: any;
  countryCode: string;
  countryName: string;
  selections: Selections;
  currencySymbol: string;
  onChange: (fn: (s: Selections) => Selections) => void;
  onClose: () => void;
  isDark: boolean;
  lang: Lang;
}) {
  const baseRates = useMemo(() => getCountryBaseRates(config, countryCode), [config, countryCode]);

  const effectiveRateFor = (role: Role) =>
    Number(selections._rateOverrides?.[countryCode]?.[role] ?? baseRates[role] ?? 0);

  const setRate = (role: Role, v: number) =>
    onChange((s) => {
      const base = Number(baseRates[role] ?? 0);
      const val = Number.isFinite(v) ? v : base;
      const nextCountry = { ...(s._rateOverrides?.[countryCode] ?? {}) } as Record<string, number>;
      if (val === base) delete nextCountry[role]; else nextCountry[role] = val;
      return { ...s, _rateOverrides: { ...(s._rateOverrides ?? {}), [countryCode]: nextCountry } };
    });

  const resetOverrides = () =>
    onChange((s) => {
      const next = { ...(s._rateOverrides ?? {}) };
      delete next[countryCode];
      return { ...s, _rateOverrides: next };
    });

  return (
    <Modal onClose={onClose} title={`Edit Rates — ${countryName}`} isDark={isDark}>
      <div className="space-y-3">
        {(["design","frontend","backend","pm","qa","devops","seo","content"] as Role[]).map((role) => (
          <div key={role} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-36">
              <div className="capitalize">{role}</div>
              <RateHelp text={tRateHelp(lang, role)} isDark={isDark} />
            </div>
            <div className="text-xs w-28 text-neutral-500">
              base: {baseRates[role] ?? 0} {currencySymbol}/h
            </div>
            <input
              type="number"
              className={cx("w-28 rounded-lg p-2 border",
                isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-300")}
              value={effectiveRateFor(role)}
              onChange={(e) => setRate(role, Number(e.target.value))}
            />
            <div className="w-10 text-right text-sm">{currencySymbol}/h</div>
          </div>
        ))}
      </div>

      {/* VAT */}
      <div className="mt-5">
        <h4 className="text-sm font-medium mb-2">VAT</h4>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(selections._taxOverrides?.[countryCode]?.vatIncluded)}
              onChange={(e) =>
                onChange((s) => ({
                  ...s,
                  _taxOverrides: {
                    ...(s._taxOverrides ?? {}),
                    [countryCode]: { ...(s._taxOverrides?.[countryCode] ?? {}), vatIncluded: e.target.checked }
                  }
                }))
              }
            />
            VAT included in totals
          </label>
          <label className="flex items-center gap-2 text-sm">
            VAT %
            <input
              type="number"
              className={cx("w-24 rounded-lg p-2 border",
                isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-300")}
              value={Number(selections._taxOverrides?.[countryCode]?.vatPercent ?? 21)}
              onChange={(e) =>
                onChange((s) => ({
                  ...s,
                  _taxOverrides: {
                    ...(s._taxOverrides ?? {}),
                    [countryCode]: { ...(s._taxOverrides?.[countryCode] ?? {}), vatPercent: Number(e.target.value) }
                  }
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="mt-5 flex justify-between">
        <Button variant="outline" onClick={resetOverrides} isDark={isDark}>Reset to base rates</Button>
        <Button variant="solid" onClick={onClose} isDark={isDark}>Done</Button>
      </div>
    </Modal>
  );
}

/* ---------- lever rendering ---------- */

function renderLeverCard(
  lever: Lever,
  selections: Selections,
  setSelections: (fn: (s: Selections) => Selections) => void,
  isDark: boolean,
  lang?: Lang
): React.ReactNode {
  const key = lever.id;
  const L = tLever(lang as Lang, lever.id);
  const title = L.label ?? (lever as any).label ?? lever.id;
  const help = L.help ?? (lever as any).help;

  if (lever.type === "number") {
    const val = Number(selections[lever.id] ?? (lever as any).default ?? 0);
    return (
      <FieldCard key={key} title={title} help={help} isDark={isDark}>
        <input
          id={lever.id}
          type="number"
          min={(lever as any).min}
          max={(lever as any).max}
          value={val}
          onChange={(e) =>
            setSelections((s) => ({
              ...s,
              [lever.id]: clamp(Number(e.target.value), (lever as any).min, (lever as any).max),
            }))
          }
          className={cx(
            "w-full rounded-lg p-2 border",
            isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-300"
          )}
        />
      </FieldCard>
    );
  }

  if (lever.type === "select") {
    const val = String(selections[lever.id] ?? (lever as any).default ?? (lever.options[0]?.value ?? ""));
    const options = lever.options.map((o) => ({
      value: o.value,
      label: tOptionLabel(lang as Lang, lever.id, o.value, (o as any).label),
    }));
    return (
      <FieldCard key={key} title={title} help={help} isDark={isDark}>
        <SelectFancy
          ariaLabel={title}
          value={val}
          onChange={(v) => setSelections((s) => ({ ...s, [lever.id]: v }))}
          options={options}
          isDark={isDark}
        />
      </FieldCard>
    );
  }

  if (lever.type === "multiselect") {
    const vals: string[] = Array.isArray(selections[lever.id]) ? selections[lever.id] : [];
    const maxSelected = (lever as any).maxSelected as number | undefined;
    return (
      <FieldCard key={key} title={title} help={help} isDark={isDark}>
        <div className="mt-1 flex flex-wrap gap-2">
          {lever.options.map((o) => {
            const active = vals.includes(o.value);
            const label = tOptionLabel(lang as Lang, lever.id, o.value, (o as any).label);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setSelections((s) => {
                    const curr: string[] = Array.isArray(s[lever.id]) ? s[lever.id] : [];
                    const exists = curr.includes(o.value);
                    let next = exists ? curr.filter((x) => x !== o.value) : [...curr, o.value];
                    if (maxSelected && next.length > maxSelected) next = next.slice(0, maxSelected);
                    return { ...s, [lever.id]: next };
                  });
                }}
                className={cx(
                  "px-3 py-1 rounded-lg border transition",
                  active
                    ? (isDark ? "border-neutral-100 bg-neutral-100 text-neutral-900" : "border-neutral-900 bg-neutral-900 text-white")
                    : (isDark ? "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500" : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-500")
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {maxSelected && (<p className="w-full mt-2 text-xs text-neutral-500">Max {maxSelected} selections.</p>)}
      </FieldCard>
    );
  }

  return null;
}

/* ---------- UI atoms ---------- */

function FieldCard({ title, help, children, isDark }: { title: string; help?: string; children: React.ReactNode; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx("relative rounded-xl p-4 sm:p-5 border", isDark ? "border-neutral-800" : "border-neutral-200")}>
      <div className="flex items-start justify-between">
        <label className={cx("text-sm", isDark ? "text-neutral-300" : "text-neutral-700")}>{title}</label>
        {help ? <HelpDot text={help} onClick={() => setOpen(!open)} open={open} isDark={isDark} /> : null}
      </div>
      {help && open && <Popover title={title} text={help} onClose={() => setOpen(false)} isDark={isDark} />}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function HelpDot({ text, onClick, open, isDark }: { text: string; onClick?: () => void; open?: boolean; isDark: boolean }) {
  const [localOpen, setLocalOpen] = useState(false);
  const toggler = onClick ?? (() => setLocalOpen(!localOpen));
  const state = open ?? localOpen;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggler(); }}
      className={cx(
        "ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs",
        isDark ? cx("border-neutral-600 text-neutral-300 hover:bg-neutral-800", state && "bg-neutral-800")
               : cx("border-neutral-400 text-neutral-700 hover:bg-neutral-100", state && "bg-neutral-100")
      )}
      aria-label="More info"
      title="More info"
    >
      <span className="leading-none">?</span>
    </button>
  );
}

function RateHelp({ text, isDark }: { text: string; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <HelpDot text={text} onClick={() => setOpen(o => !o)} open={open} isDark={isDark} />
      {open && (
        <div
          className={cx(
            "absolute z-20 mt-2 w-64 rounded-md p-3 text-xs border shadow-xl right-0",
            isDark ? "bg-neutral-900 border-neutral-700 text-neutral-200"
                   : "bg-white border-neutral-200 text-neutral-800"
          )}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function Popover({ title, text, onClose, isDark }: { title: string; text: string; onClose: () => void; isDark: boolean }) {
  return (
    <div className={cx(
      "absolute right-3 top-10 z-10 w-72 rounded-lg p-3 text-sm shadow-xl border",
      isDark ? "bg-neutral-900 border-neutral-700 text-neutral-200" : "bg-white border-neutral-200 text-neutral-800"
    )}>
      <div className="font-medium mb-1">{title}</div>
      <div>{text}</div>
      <div className="mt-2 text-right">
        <button className={cx("text-xs", isDark ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-600 hover:text-neutral-900")} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Card({ title, action, children, isDark }: { title: string; action?: React.ReactNode; children: React.ReactNode; isDark: boolean }) {
  return (
    <div className={cx("rounded-2xl p-5 sm:p-6 border",
      isDark ? "border-neutral-800 bg-neutral-900/40" : "border-neutral-200 bg-white/80"
    )}>
      <div className="flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-medium">{title}</h3>
        {action ?? null}
      </div>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}
function BigNumber({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs sm:text-sm text-neutral-400">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold">{value}</div>
    </div>
  );
}
function ListRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/* Improved dropdown */
function SelectFancy({
  value, onChange, options, ariaLabel, isDark, widthClass
}: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel?: string; isDark: boolean; widthClass?: string;
}) {
  return (
    <div className={cx("relative", widthClass ?? "w-[200px]")}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "w-full appearance-none rounded-lg pl-3 pr-8 py-2 text-sm border focus:outline-none focus:ring-2",
          isDark
            ? "bg-neutral-900 border-neutral-700 focus:ring-neutral-600"
            : "bg-white border-neutral-300 focus:ring-neutral-400"
        )}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {/* Chevron */}
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function Button({
  children, onClick, variant = "outline", size = "sm", isDark
}: {
  children: React.ReactNode; onClick?: () => void; variant?: "solid" | "outline"; size?: "xs" | "sm"; isDark: boolean;
}) {
  const pad = size === "xs" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const base = "rounded-lg border transition";
  const cls = variant === "solid"
    ? (isDark ? "bg-neutral-100 text-neutral-900 border-neutral-100 hover:opacity-90"
              : "bg-neutral-900 text-white border-neutral-900 hover:opacity-90")
    : (isDark ? "border-neutral-700 hover:bg-neutral-900"
              : "border-neutral-300 hover:bg-neutral-100");
  return <button onClick={onClick} className={cx(base, pad, cls)}>{children}</button>;
}

function Modal({ title, children, onClose, isDark }: { title: string; children: React.ReactNode; onClose: () => void; isDark: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cx("relative w-full max-w-2xl rounded-2xl p-5 sm:p-6 border shadow-2xl",
        isDark ? "border-neutral-800 bg-neutral-950 text-neutral-100" : "border-neutral-200 bg-white text-neutral-900"
      )}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className={cx("rounded-full h-8 w-8 inline-flex items-center justify-center border",
              isDark ? "border-neutral-700 hover:bg-neutral-900" : "border-neutral-300 hover:bg-neutral-100")}
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
function Stepper({ value, onChange, step = 1, isDark }: { value: number; onChange: (v: number) => void; step?: number; isDark: boolean; }) {
  return (
    <div className="flex items-center gap-2">
      <button className={cx("h-8 w-8 rounded-lg border", isDark ? "border-neutral-700 hover:bg-neutral-900" : "border-neutral-300 hover:bg-neutral-100")}
        onClick={() => onChange(Number((value - step).toFixed(2)))}>−</button>
      <input type="number" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))}
        className={cx("w-20 rounded-lg p-2 text-center border", isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-300")} step={step} />
      <button className={cx("h-8 w-8 rounded-lg border", isDark ? "border-neutral-700 hover:bg-neutral-900" : "border-neutral-300 hover:bg-neutral-100")}
        onClick={() => onChange(Number((value + step).toFixed(2)))}>+</button>
    </div>
  );
}
