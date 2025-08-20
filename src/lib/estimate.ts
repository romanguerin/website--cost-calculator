// Estimation engine v0.4.1
// - Blended hourly rate mode (vs. country role rates)
// - Manual role adjustments: selections._roleAdjust?: Partial<Record<Role, number>>
// - Hours model: number/select/multiselect + hoursPerUnit/Batch/Base/PerExtraLocale
// - Multipliers (multiplier.role / multiplier.all)
// - Dependencies (hide/adjust) + visibleWhen
// - PM/QA overhead + P50/P80
// - Helpers: visibleLeverIdSet, applyPreset

/* ================== Types ================== */

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

type LeverCommon = {
  id: string;
  label: string;
  group?: string;
  help?: string;
  visibleWhen?: VisibleWhenRule[];
};

type LeverSelect = LeverCommon & {
  type: "select";
  options: Array<Record<string, any> & { value: string; label: string }>;
  default?: string;
};

type LeverMultiselect = LeverCommon & {
  type: "multiselect";
  options: Array<Record<string, any> & { value: string; label: string }>;
  maxSelected?: number;
};

type LeverNumber = LeverCommon & {
  type: "number";
  unit?: string;
  min?: number;
  max?: number;
  default?: number;
  hoursPerUnit?: Partial<Record<Role, number>>;
  hoursPerBatch?: { batchSize: number } & Partial<Record<Role, number>>;
  hoursBase?: Partial<Record<Role, number>>;
  hoursPerExtraLocale?: Partial<Record<Role, number>>;
};

export type Lever = LeverSelect | LeverMultiselect | LeverNumber;

type Dependency = {
  if: { id: string; equals: string | number | boolean };
  then?: {
    hide?: string[];
    adjust?: Array<{ id: string; set: any }>;
    show?: string[];
  };
};

export type Config = {
  version: string;
  currencyDefault: string;
  currencies?: Record<string, { symbol: string; fxToEUR: number }>;
  ui?: {
    groups?: { id: string; label: string }[];
    pricing?: {
      allowBlendedRate?: boolean;
      defaultRateMode?: "country_roles" | "blended";
      defaultBlendedRate?: number;
    };
  };
  countries: Country[];
  globalOverheads: {
    pmPercentOfBuild: number;
    qaPercentOfBuild: number;
    contingencyRiskBands: { low: number; medium: number; high: number };
    maintenance?: { warrantyWeeks: number; retainerMonthlyPercent: number };
  };
  levers: Lever[];
  dependencies?: Dependency[];
  presets?: Array<{ id: string; label: string; country: string; values: Record<string, any> }>;
  outputConfig?: {
    showBands?: Array<"P50" | "P80">;
    rounding?: { currency?: number; hours?: number };
    includeAssumptions?: boolean;
    includeExclusions?: boolean;
  };
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
    rateMode: "country_roles" | "blended";
    blendedRate?: number;
    preAdjustHours: Record<Role, number>;
    roleAdjust: Partial<Record<Role, number>>;
  };
};

/* ================== Consts & helpers ================== */

const ROLES: Role[] = ["design", "frontend", "backend", "pm", "qa", "devops", "seo", "content"];
const BUILD_ROLES: Role[] = ["design", "frontend", "backend", "devops", "seo", "content"];

function cloneZeros(): Record<Role, number> {
  return ROLES.reduce((acc, r) => ((acc[r] = 0), acc), {} as Record<Role, number>);
}

function round(n: number, places = 0): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

function clamp(n: number, min?: number, max?: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return min ?? 0;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

function currencySymbolFor(config: Config, currencyCode: string): string {
  const sym = config.currencies?.[currencyCode]?.symbol;
  if (sym) return sym;
  if (currencyCode === "EUR") return "€";
  if (currencyCode === "USD") return "$";
  if (currencyCode === "GBP") return "£";
  return currencyCode;
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

function applyMultiplierHours(hours: Record<Role, number>, multipliers: Partial<Record<Role | "all", number>>) {
  const allMul = multipliers["all"] ?? 1;
  for (const r of ROLES) {
    const m = multipliers[r] ?? 1;
    hours[r] *= m * allMul;
  }
}

function applyDependencies(config: Config, baseSelections: Selections): { selections: Selections; hiddenIds: Set<string> } {
  let selections = { ...baseSelections };
  const hiddenIds = new Set<string>();
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const dep of config.dependencies ?? []) {
      if (selections[dep.if.id] === dep.if.equals) {
        for (const id of dep.then?.hide ?? []) hiddenIds.add(id);
        for (const adj of dep.then?.adjust ?? []) {
          if (selections[adj.id] !== adj.set) {
            selections = { ...selections, [adj.id]: adj.set };
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  return { selections, hiddenIds };
}

/* ================== Core engine ================== */

export function computeEstimate(config: Config, rawSelections: Selections): EstimateResult {
  // Country & currency
  const defaultCountry = config.countries[0];
  const countryCode = String(rawSelections?._country ?? defaultCountry.code);
  const country = config.countries.find((c) => c.code === countryCode) ?? defaultCountry;
  const currency = country.currency ?? config.currencyDefault;
  const currencySymbol = currencySymbolFor(config, currency);

  // Rate mode
  const defaultRateMode = config.ui?.pricing?.defaultRateMode ?? "country_roles";
  const rateMode = (rawSelections?._rateMode ?? defaultRateMode) as "country_roles" | "blended";
  const blendedRate = Number(rawSelections?._blendedRate ?? config.ui?.pricing?.defaultBlendedRate ?? 0);

  // Seed defaults
  const seeded: Selections = { _country: country.code, _rateMode: rateMode, _blendedRate: blendedRate, ...rawSelections };
  for (const lever of config.levers) {
    if (seeded[lever.id] == null && (lever as any).default != null) seeded[lever.id] = (lever as any).default;
    if (lever.type === "multiselect" && seeded[lever.id] == null) seeded[lever.id] = [];
  }
  if (seeded._roleAdjust == null) seeded._roleAdjust = {};

  // Dependencies
  const { selections, hiddenIds } = applyDependencies(config, seeded);

  // Build hours (before manual adjustments)
  const hours = cloneZeros();

  for (const lever of config.levers) {
    if (hiddenIds.has(lever.id)) continue;
    if (!visibleForLever(lever, selections)) continue;

    const value = selections[lever.id];

    if (lever.type === "number") {
      const n = clamp(Number(value ?? lever.default ?? 0), lever.min, lever.max);
      if (lever.hoursPerUnit) addHours(hours, lever.hoursPerUnit, n);
      if (lever.hoursBase || lever.hoursPerExtraLocale) {
        addHours(hours, lever.hoursBase, 1);
        if (n > 1) addHours(hours, lever.hoursPerExtraLocale, n - 1);
      }
      if (lever.hoursPerBatch && lever.hoursPerBatch.batchSize > 0) {
        const { batchSize, ...roleHours } = lever.hoursPerBatch;
        const batches = n > 0 ? Math.ceil(n / batchSize) : 0;
        addHours(hours, roleHours as Partial<Record<Role, number>>, batches);
      }
    }

    if (lever.type === "select") {
      const opt = lever.options.find((o) => o.value === value) ?? lever.options[0];
      if (opt) {
        for (const key of Object.keys(opt)) {
          if (key.startsWith("hours.")) {
            const role = key.split(".")[1] as Role;
            hours[role] += Number(opt[key]) || 0;
          }
        }
      }
    }

    if (lever.type === "multiselect") {
      const arr: string[] = Array.isArray(value) ? value : [];
      for (const v of arr) {
        const opt = lever.options.find((o) => o.value === v);
        if (!opt) continue;
        for (const key of Object.keys(opt)) {
          if (key.startsWith("hours.")) {
            const role = key.split(".")[1] as Role;
            hours[role] += Number(opt[key]) || 0;
          }
        }
      }
    }
  }

  // Multipliers
  const multipliers: Partial<Record<Role | "all", number>> = {};
  for (const lever of config.levers) {
    if (hiddenIds.has(lever.id)) continue;
    if (!visibleForLever(lever, selections)) continue;

    if (lever.type === "select") {
      const opt = lever.options.find((o) => o.value === selections[lever.id]);
      if (opt) {
        for (const key of Object.keys(opt)) {
          if (key.startsWith("multiplier.")) {
            const k = key.split(".")[1] as Role | "all";
            const val = Number(opt[key]);
            multipliers[k] = (multipliers[k] ?? 1) * (isFinite(val) ? val : 1);
          }
        }
      }
    }

    if (lever.type === "multiselect") {
      const arr: string[] = Array.isArray(selections[lever.id]) ? selections[lever.id] : [];
      for (const v of arr) {
        const opt = lever.options.find((o) => o.value === v);
        if (!opt) continue;
        for (const key of Object.keys(opt)) {
          if (key.startsWith("multiplier.")) {
            const k = key.split(".")[1] as Role | "all";
            const val = Number(opt[key]);
            multipliers[k] = (multipliers[k] ?? 1) * (isFinite(val) ? val : 1);
          }
        }
      }
    }
  }
  if (Object.keys(multipliers).length) applyMultiplierHours(hours, multipliers);

  // Keep a snapshot before manual edits
  const preAdjust = { ...hours };

  // Manual role adjustments (delta hours) — apply to BUILD roles before PM/QA
  const roleAdjust: Partial<Record<Role, number>> = selections._roleAdjust ?? {};
  for (const r of BUILD_ROLES) {
    const delta = Number(roleAdjust[r] ?? 0);
    if (!Number.isNaN(delta) && delta !== 0) hours[r] += delta;
  }

  // Rates: blended or role-based
  const rates = country.baseRates;
  const useBlended = rateMode === "blended";
  const rateFor = (r: Role) => (useBlended ? blendedRate : (rates[r] ?? 0));

  // Subtotals
  const subtotalHours = BUILD_ROLES.reduce((sum, r) => sum + (hours[r] || 0), 0);
  const subtotalCost = BUILD_ROLES.reduce((sum, r) => sum + (hours[r] || 0) * rateFor(r), 0);

  // Overheads
  const pmHours = subtotalHours * config.globalOverheads.pmPercentOfBuild;
  const qaHours = subtotalHours * config.globalOverheads.qaPercentOfBuild;
  const pmCost = pmHours * rateFor("pm");
  const qaCost = qaHours * rateFor("qa");

  // Bands
  const p50HoursRaw = subtotalHours + pmHours + qaHours;
  const p50CostRaw = subtotalCost + pmCost + qaCost;

  const riskLevel = (selections["risk_level"] ?? "medium") as "low" | "medium" | "high";
  const riskPct = config.globalOverheads.contingencyRiskBands[riskLevel] ?? 0.12;
  const p80HoursRaw = p50HoursRaw * (1 + riskPct);
  const p80CostRaw = p50CostRaw * (1 + riskPct);

  // Rounding
  const hoursPlaces = config.outputConfig?.rounding?.hours ?? 1;
  const moneyPlaces = config.outputConfig?.rounding?.currency ?? 0;

  const hoursByRoleRounded = ROLES.reduce((acc, r) => {
    // PM/QA are not in BUILD_ROLES totals; we report their own hours via overheads, but keep per-role zeros for clarity
    const base = r === "pm" ? pmHours : r === "qa" ? qaHours : hours[r] || 0;
    acc[r] = round(base, hoursPlaces);
    return acc;
  }, {} as Record<Role, number>);

  const costByRoleRounded = ROLES.reduce((acc, r) => {
    const baseCost = r === "pm" ? pmCost : r === "qa" ? qaCost : (hours[r] || 0) * rateFor(r);
    acc[r] = round(baseCost, moneyPlaces);
    return acc;
  }, {} as Record<Role, number>);

  return {
    hoursByRole: hoursByRoleRounded,
    costByRole: costByRoleRounded,
    subtotalHours: round(subtotalHours, hoursPlaces),
    subtotalCost: round(subtotalCost, moneyPlaces),
    overheads: {
      pmHours: round(pmHours, hoursPlaces),
      qaHours: round(qaHours, hoursPlaces),
      pmCost: round(pmCost, moneyPlaces),
      qaCost: round(qaCost, moneyPlaces),
    },
    p50: { hours: round(p50HoursRaw, hoursPlaces), cost: round(p50CostRaw, moneyPlaces) },
    p80: { hours: round(p80HoursRaw, hoursPlaces), cost: round(p80CostRaw, moneyPlaces) },
    currency,
    currencySymbol,
    debug: {
      countryCode: country.code,
      hiddenLeverIds: [...hiddenIds],
      appliedMultipliers: multipliers,
      rateMode,
      blendedRate: useBlended ? blendedRate : undefined,
      preAdjustHours: preAdjust,
      roleAdjust,
    },
  };
}

/* ================== UI helpers ================== */

export function visibleLeverIdSet(config: Config, rawSelections: Selections): Set<string> {
  const seeded: Selections = { ...rawSelections };
  for (const l of config.levers) {
    if (seeded[l.id] == null && (l as any).default != null) seeded[l.id] = (l as any).default;
    if (l.type === "multiselect" && seeded[l.id] == null) seeded[l.id] = [];
  }
  const { selections, hiddenIds } = applyDependencies(config, seeded);
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
