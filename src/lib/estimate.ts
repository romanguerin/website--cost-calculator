// Minimal estimator that understands:
// - options with hours.* (e.g., "hours.frontend": 12)
// - number levers with hoursPerUnit
// - locales: hoursBase + hoursPerExtraLocale*(n-1)
// - multipliers: "multiplier.role" and "multiplier.all"
// - global PM/QA percentages
// - risk bands => P80

type Role =
  | "design"
  | "frontend"
  | "backend"
  | "pm"
  | "qa"
  | "devops"
  | "seo"
  | "content";

type HoursByRole = Partial<Record<Role, number>>;
type RatesByRole = Record<Role, number>;

type Country = {
  code: string;
  name: string;
  currency: string;
  baseRates: RatesByRole;
  tax: { vatIncluded: boolean; vatPercent: number };
};

type LeverOption = Record<string, any> & { value: string; label: string };
type Lever =
  | {
      id: string;
      label: string;
      type: "select";
      options: LeverOption[];
      default?: string;
    }
  | {
      id: string;
      label: string;
      type: "number";
      min?: number;
      max?: number;
      default?: number;
      hoursPerUnit?: Partial<Record<Role, number>>;
      hoursBase?: Partial<Record<Role, number>>;
      hoursPerExtraLocale?: Partial<Record<Role, number>>;
    };

type Config = {
  countries: Country[];
  globalOverheads: {
    pmPercentOfBuild: number;
    qaPercentOfBuild: number;
    contingencyRiskBands: { low: number; medium: number; high: number };
  };
  levers: Lever[];
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
};

const ROLES: Role[] = [
  "design",
  "frontend",
  "backend",
  "pm",
  "qa",
  "devops",
  "seo",
  "content"
];

function cloneZero(): Record<Role, number> {
  return ROLES.reduce((acc, r) => ({ ...acc, [r]: 0 }), {} as Record<Role, number>);
}

function applyMultiplierHours(
  hours: Record<Role, number>,
  multipliers: Partial<Record<Role | "all", number>>
) {
  const allMul = multipliers["all"] ?? 1;
  for (const r of ROLES) {
    const m = multipliers[r] ?? 1;
    hours[r] *= m * allMul;
  }
}

function addHours(target: Record<Role, number>, add: Partial<Record<Role, number>>, factor = 1) {
  for (const r of ROLES) {
    if (add[r] != null) target[r] += (add[r] as number) * factor;
  }
}

export function computeEstimate(config: Config, selections: Selections): EstimateResult {
  const { countries, globalOverheads, levers } = config;

  // Country
  const countryCode: string = selections["_country"] ?? countries[0].code;
  const country = countries.find(c => c.code === countryCode) ?? countries[0];
  const rates = country.baseRates;

  // 1) Base hours accumulation
  const hours = cloneZero();

  for (const lever of levers) {
    const value = selections[lever.id] ?? (lever as any).default;

    if (lever.type === "select") {
      const opt = lever.options.find(o => o.value === value) ?? lever.options[0];

      // Add any hours.* fields
      for (const key of Object.keys(opt)) {
        if (key.startsWith("hours.")) {
          const role = key.split(".")[1] as Role;
          hours[role] += Number(opt[key]) || 0;
        }
      }

      // Collect multipliers but apply after all base hours are summed
      // We'll accumulate a combined multiplier per role
    }

    if (lever.type === "number") {
      const n = Number(value ?? lever.default ?? 0);

      // hoursPerUnit
      if (lever.hoursPerUnit) {
        addHours(hours, lever.hoursPerUnit, n);
      }

      // i18n model: hoursBase + hoursPerExtraLocale*(n-1)
      if (lever.hoursBase || lever.hoursPerExtraLocale) {
        const base = lever.hoursBase ?? {};
        const extra = lever.hoursPerExtraLocale ?? {};
        addHours(hours, base, 1);
        if (n > 1) addHours(hours, extra, n - 1);
      }
    }
  }

  // 2) Apply multipliers (from selected select options)
  const multipliers: Partial<Record<Role | "all", number>> = {};
  for (const lever of levers) {
    if (lever.type !== "select") continue;
    const value = selections[lever.id] ?? lever.default;
    const opt = lever.options.find(o => o.value === value);
    if (!opt) continue;
    for (const key of Object.keys(opt)) {
      if (key.startsWith("multiplier.")) {
        const k = key.split(".")[1] as Role | "all";
        multipliers[k] = (multipliers[k] ?? 1) * Number(opt[key]);
      }
    }
  }
  if (Object.keys(multipliers).length) applyMultiplierHours(hours, multipliers);

  // 3) Subtotal (build only, before PM/QA overheads)
  const subtotalHours =
    hours.design + hours.frontend + hours.backend + hours.devops + hours.seo + hours.content;
  const subtotalCost =
    hours.design * rates.design +
    hours.frontend * rates.frontend +
    hours.backend * rates.backend +
    hours.devops * rates.devops +
    hours.seo * rates.seo +
    hours.content * rates.content;

  // 4) PM/QA overheads (percentage of build)
  const pmHours = subtotalHours * globalOverheads.pmPercentOfBuild;
  const qaHours = subtotalHours * globalOverheads.qaPercentOfBuild;
  const pmCost = pmHours * rates.pm;
  const qaCost = qaHours * rates.qa;

  const p50Hours = subtotalHours + pmHours + qaHours;
  const p50Cost = subtotalCost + pmCost + qaCost;

  // 5) Risk (P80)
  const riskLevel = selections["risk_level"] ?? "medium";
  const riskPct = globalOverheads.contingencyRiskBands[riskLevel as "low" | "medium" | "high"] ?? 0.12;
  const p80Hours = p50Hours * (1 + riskPct);
  const p80Cost = p50Cost * (1 + riskPct);

  return {
    hoursByRole: hours,
    costByRole: {
      design: hours.design * rates.design,
      frontend: hours.frontend * rates.frontend,
      backend: hours.backend * rates.backend,
      devops: hours.devops * rates.devops,
      seo: hours.seo * rates.seo,
      content: hours.content * rates.content,
      pm: pmCost,
      qa: qaCost
    } as Record<Role, number>,
    subtotalHours,
    subtotalCost,
    overheads: { pmHours, qaHours, pmCost, qaCost },
    p50: { hours: round1(p50Hours), cost: Math.round(p50Cost) },
    p80: { hours: round1(p80Hours), cost: Math.round(p80Cost) },
    currency: country.currency
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
