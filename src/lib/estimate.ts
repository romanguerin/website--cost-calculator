// Estimation engine v0.9 — blended rates removed.

export type Role =
  | "design"
  | "frontend"
  | "backend"
  | "pm"
  | "qa"
  | "devops"
  | "seo"
  | "content";

export type RatesByRole = Record<Role, number>;

type Country = {
  code: string;
  name: string;
  currency: string;
  baseRates: RatesByRole & Partial<Record<"fullstack", number>>;
  tax: { vatIncluded: boolean; vatPercent: number };
};

type VisibleWhenRule = { id: string; equals: string | number | boolean };

type LeverCommon = { id: string; label: string; group?: string; help?: string; visibleWhen?: VisibleWhenRule[] };
type LeverSelect = LeverCommon & { type: "select"; options: Array<Record<string, any> & { value: string; label: string }>; default?: string; };
type LeverMultiselect = LeverCommon & { type: "multiselect"; options: Array<Record<string, any> & { value: string; label: string }>; maxSelected?: number; };
type LeverNumber = LeverCommon & {
  type: "number"; unit?: string; min?: number; max?: number; default?: number;
  hoursPerUnit?: Partial<Record<Role, number>>;
  hoursPerBatch?: { batchSize: number } & Partial<Record<Role, number>>;
  hoursBase?: Partial<Record<Role, number>>;
  hoursPerExtraLocale?: Partial<Record<Role, number>>;
};
export type Lever = LeverSelect | LeverMultiselect | LeverNumber;

type Dependency = { if: { id: string; equals: string | number | boolean }; then?: { hide?: string[]; adjust?: Array<{ id: string; set: any }>; show?: string[] } };

export type Config = {
  version: string;
  currencyDefault: string;
  currencies?: Record<string, { symbol: string; fxToEUR: number }>;
  ui?: { groups?: { id: string; label: string }[] };
  countries: Country[];
  globalOverheads: {
    pmPercentOfBuild: number;
    qaPercentOfBuild: number;
    contingencyRiskBands: { low: number; medium: number; high: number };
    maintenance?: { warrantyWeeks: number; retainerMonthlyPercent: number };
  };
  levers: Lever[];
  dependencies?: Dependency[];
  presets?: Array<{ id: string; label: string; country: string; values: Record<string, any>; meta?: any }>;
  outputConfig?: { showBands?: Array<"P50" | "P80">; rounding?: { currency?: number; hours?: number }; includeAssumptions?: boolean; includeExclusions?: boolean; };
  assumptions?: string[];
  exclusions?: string[];
};

export type Selections = Record<string, any>;

export type EstimateResult = {
  hoursByRole: Record<Role, number>;
  costByRole: Record<Role, number>;
  subtotalHours: number;
  subtotalCost: number;
  overheads: { pmHours: number; qaHours: number; pmCost: number; qaCost: number };
  p50: { hours: number; cost: number };
  p80: { hours: number; cost: number };
  currency: string;
  currencySymbol: string;
  debug: {
    countryCode: string;
    hiddenLeverIds: string[];
    appliedMultipliers: Partial<Record<Role | "all", number>>;
    usedRates: RatesByRole;
    userRateOverride?: Partial<RatesByRole>;
    userTaxOverride?: { vatIncluded?: boolean; vatPercent?: number };
    preAdjustHours: Record<Role, number>;
    roleAdjust: Partial<Record<Role, number>>;
  };
};

const ROLES: Role[] = ["design", "frontend", "backend", "pm", "qa", "devops", "seo", "content"];
const BUILD_ROLES: Role[] = ["design", "frontend", "backend", "devops", "seo", "content"];

function cloneZeros(): Record<Role, number> {
  return ROLES.reduce((acc, r) => ((acc[r] = 0), acc), {} as Record<Role, number>);
}
function round(n: number, p = 0) { const m = Math.pow(10, p); return Math.round(n * m) / m; }
function clamp(n: number, min?: number, max?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return min ?? 0;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}
function currencySymbolFor(config: Config, ccy: string) {
  return config.currencies?.[ccy]?.symbol ?? (ccy === "EUR" ? "€" : ccy === "USD" ? "$" : ccy === "GBP" ? "£" : ccy);
}
function visibleForLever(lever: Lever, selections: Selections): boolean {
  if (!lever.visibleWhen || lever.visibleWhen.length === 0) return true;
  return lever.visibleWhen.every((r) => selections[r.id] === r.equals);
}
function addHours(target: Record<Role, number>, add?: Partial<Record<Role, number>>, factor = 1) {
  if (!add) return;
  for (const r of ROLES) {
    const v = add[r];
    if (v != null) target[r] += v * factor;
  }
}
function applyMultiplierHours(hours: Record<Role, number>, mults: Partial<Record<Role | "all", number>>) {
  const allMul = mults["all"] ?? 1;
  for (const r of ROLES) hours[r] *= (mults[r] ?? 1) * allMul;
}
function applyDependencies(config: Config, base: Selections): { selections: Selections; hiddenIds: Set<string> } {
  let selections = { ...base };
  const hiddenIds = new Set<string>();
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const dep of config.dependencies ?? []) {
      if (selections[dep.if.id] === dep.if.equals) {
        for (const id of dep.then?.hide ?? []) hiddenIds.add(id);
        for (const adj of dep.then?.adjust ?? []) {
          if (selections[adj.id] !== adj.set) { selections = { ...selections, [adj.id]: adj.set }; changed = true; }
        }
      }
    }
    if (!changed) break;
  }
  return { selections, hiddenIds };
}

/** Public helper: base role rates for a country (for UI defaults) */
export function getCountryBaseRates(config: Config, countryCode: string): RatesByRole {
  const def = config.countries[0];
  const country = config.countries.find(c => c.code === countryCode) ?? def;
  const out = {} as RatesByRole;
  for (const r of ROLES) out[r] = Number((country.baseRates as any)?.[r] ?? 0);
  return out;
}

export function computeEstimate(config: Config, rawSelections: Selections): EstimateResult {
  // Country / currency
  const defCountry = config.countries[0];
  const countryCode = String(rawSelections?._country ?? defCountry.code);
  const country = config.countries.find((c) => c.code === countryCode) ?? defCountry;
  const currency = country.currency ?? config.currencyDefault;
  const currencySymbol = currencySymbolFor(config, currency);

  // Seed defaults
  const seeded: Selections = { _country: country.code, ...rawSelections };
  for (const lever of config.levers) {
    if (seeded[lever.id] == null && (lever as any).default != null) seeded[lever.id] = (lever as any).default;
    if (lever.type === "multiselect" && seeded[lever.id] == null) seeded[lever.id] = [];
  }
  if (seeded._roleAdjust == null) seeded._roleAdjust = {};

  // Dependencies
  const { selections, hiddenIds } = applyDependencies(config, seeded);

  // Build hours
  const hours = cloneZeros();
  for (const lever of config.levers) {
    if (hiddenIds.has(lever.id)) continue;
    if (!visibleForLever(lever, selections)) continue;
    const value = selections[lever.id];

    if (lever.type === "number") {
      const n = clamp(Number(value ?? (lever as any).default ?? 0), (lever as any).min, (lever as any).max);
      if ((lever as any).hoursPerUnit) addHours(hours, (lever as any).hoursPerUnit, n);
      if ((lever as any).hoursBase || (lever as any).hoursPerExtraLocale) {
        addHours(hours, (lever as any).hoursBase, 1);
        if (n > 1) addHours(hours, (lever as any).hoursPerExtraLocale, n - 1);
      }
      if ((lever as any).hoursPerBatch && (lever as any).hoursPerBatch.batchSize > 0) {
        const { batchSize, ...roleHours } = (lever as any).hoursPerBatch;
        const batches = n > 0 ? Math.ceil(n / batchSize) : 0;
        addHours(hours, roleHours as Partial<Record<Role, number>>, batches);
      }
    }

    if (lever.type === "select") {
      const opt = lever.options.find((o) => o.value === value) ?? lever.options[0];
      if (opt) {
        for (const k of Object.keys(opt)) {
          if (k.startsWith("hours.")) {
            const role = k.split(".")[1] as Role;
            hours[role] += Number((opt as any)[k]) || 0;
          }
        }
      }
    }

    if (lever.type === "multiselect") {
      const arr: string[] = Array.isArray(value) ? value : [];
      for (const v of arr) {
        const opt = lever.options.find((o) => o.value === v);
        if (!opt) continue;
        for (const k of Object.keys(opt)) {
          if (k.startsWith("hours.")) {
            const role = k.split(".")[1] as Role;
            hours[role] += Number((opt as any)[k]) || 0;
          }
        }
      }
    }
  }

  // Hours multipliers
  const multipliers: Partial<Record<Role | "all", number>> = {};
  for (const lever of config.levers) {
    if (hiddenIds.has(lever.id)) continue;
    if (!visibleForLever(lever, selections)) continue;
    if (lever.type === "select") {
      const opt = lever.options.find((o) => o.value === selections[lever.id]);
      if (opt) {
        for (const k of Object.keys(opt)) {
          if (k.startsWith("multiplier.")) {
            const key = k.split(".")[1] as Role | "all";
            const val = Number((opt as any)[k]);
            multipliers[key] = (multipliers[key] ?? 1) * (isFinite(val) ? val : 1);
          }
        }
      }
    }
    if (lever.type === "multiselect") {
      const arr: string[] = Array.isArray(selections[lever.id]) ? selections[lever.id] : [];
      for (const v of arr) {
        const opt = lever.options.find((o) => o.value === v);
        if (!opt) continue;
        for (const k of Object.keys(opt)) {
          if (k.startsWith("multiplier.")) {
            const key = k.split(".")[1] as Role | "all";
            const val = Number((opt as any)[k]);
            multipliers[key] = (multipliers[key] ?? 1) * (isFinite(val) ? val : 1);
          }
        }
      }
    }
  }
  if (Object.keys(multipliers).length) applyMultiplierHours(hours, multipliers);

  const preAdjust = { ...hours };

  // Manual role deltas
  const roleAdjust: Partial<Record<Role, number>> = selections._roleAdjust ?? {};
  for (const r of BUILD_ROLES) {
    const delta = Number(roleAdjust[r] ?? 0);
    if (!Number.isNaN(delta) && delta !== 0) hours[r] += delta;
  }

  // Rates (with user overrides)
  const userRatesForCountry: Partial<RatesByRole> | undefined = selections._rateOverrides?.[country.code];
  const mergedRates: RatesByRole = { ...country.baseRates, ...(userRatesForCountry ?? {}) };
  const rateFor = (r: Role) => (mergedRates[r] ?? 0);

  // Subtotals
  const subtotalHours = BUILD_ROLES.reduce((s, r) => s + (hours[r] || 0), 0);
  const subtotalCost  = BUILD_ROLES.reduce((s, r) => s + (hours[r] || 0) * rateFor(r), 0);

  // Overheads
  const pmHours = subtotalHours * config.globalOverheads.pmPercentOfBuild;
  const qaHours = subtotalHours * config.globalOverheads.qaPercentOfBuild;
  const pmCost  = pmHours * rateFor("pm");
  const qaCost  = qaHours * rateFor("qa");

  // Bands
  const p50HoursRaw = subtotalHours + pmHours + qaHours;
  const p50CostRaw  = subtotalCost + pmCost + qaCost;

  const riskLevel = (selections["risk_level"] ?? "medium") as "low" | "medium" | "high";
  const riskPct   = config.globalOverheads.contingencyRiskBands[riskLevel] ?? 0.12;
  const p80HoursRaw = p50HoursRaw * (1 + riskPct);
  const p80CostRaw  = p50CostRaw  * (1 + riskPct);

  // Rounding
  const hP = config.outputConfig?.rounding?.hours ?? 1;
  const cP = config.outputConfig?.rounding?.currency ?? 0;

  const hoursByRoleRounded = ROLES.reduce((acc, r) => {
    const base = r === "pm" ? pmHours : r === "qa" ? qaHours : (hours[r] || 0);
    acc[r] = round(base, hP);
    return acc;
  }, {} as Record<Role, number>);

  const costByRoleRounded = ROLES.reduce((acc, r) => {
    const baseCost = r === "pm" ? pmCost : r === "qa" ? qaCost : (hours[r] || 0) * rateFor(r);
    acc[r] = round(baseCost, cP);
    return acc;
  }, {} as Record<Role, number>);

  const userTaxOverride = selections._taxOverrides?.[country.code];

  return {
    hoursByRole: hoursByRoleRounded,
    costByRole:  costByRoleRounded,
    subtotalHours: round(subtotalHours, hP),
    subtotalCost:  round(subtotalCost, cP),
    overheads: { pmHours: round(pmHours, hP), qaHours: round(qaHours, hP), pmCost: round(pmCost, cP), qaCost: round(qaCost, cP) },
    p50: { hours: round(p50HoursRaw, hP), cost: round(p50CostRaw, cP) },
    p80: { hours: round(p80HoursRaw, hP), cost: round(p80CostRaw, cP) },
    currency, currencySymbol,
    debug: {
      countryCode: country.code,
      hiddenLeverIds: [...hiddenIds],
      appliedMultipliers: multipliers,
      usedRates: mergedRates,
      userRateOverride: userRatesForCountry,
      userTaxOverride,
      preAdjustHours: preAdjust,
      roleAdjust
    }
  };
}

/* ---------- UI helpers ---------- */

export function visibleLeverIdSet(config: Config, rawSelections: Selections): Set<string> {
  const seeded: Selections = { ...rawSelections };
  for (const l of config.levers) {
    if (seeded[l.id] == null && (l as any).default != null) seeded[l.id] = (l as any).default;
    if (l.type === "multiselect" && seeded[l.id] == null) seeded[l.id] = [];
  }
  const { selections, hiddenIds } = (function applyDeps(config: Config, base: Selections) {
    let s = { ...base }; const hid = new Set<string>();
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const dep of config.dependencies ?? []) {
        if (s[dep.if.id] === dep.if.equals) {
          for (const id of dep.then?.hide ?? []) hid.add(id);
          for (const adj of dep.then?.adjust ?? []) {
            if (s[adj.id] !== adj.set) { s = { ...s, [adj.id]: adj.set }; changed = true; }
          }
        }
      }
      if (!changed) break;
    }
    return { selections: s, hiddenIds: hid };
  })(config, seeded);
  const visible = new Set<string>();
  for (const lever of config.levers) {
    if (hiddenIds.has(lever.id)) continue;
    if (visibleForLever(lever, selections)) visible.add(lever.id);
  }
  return visible;
}

export function applyPreset(config: Config, current: Selections, presetId: string): Selections {
  const p = config.presets?.find((x) => x.id === presetId);
  if (!p) return current;
  return { ...current, ...p.values, _country: p.country };
}
