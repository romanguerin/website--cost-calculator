"use client";

import { useEffect, useMemo, useState } from "react";
import factors from "@/config/factors.json";
import { computeEstimate, type Selections } from "@/lib/estimate";

type Cfg = typeof factors;

export default function Home() {
  const config = factors as Cfg;

  // Defaults
  const [country, setCountry] = useState(config.countries[0].code);
  const [selections, setSelections] = useState<Selections>(() => {
    const s: Selections = { _country: config.countries[0].code };
    for (const l of config.levers) {
      if ("default" in l && l.default !== undefined) s[l.id] = l.default as any;
    }
    return s;
  });

  // Keep _country in selections for the engine
  useEffect(() => {
    setSelections(prev => ({ ...prev, _country: country }));
  }, [country]);

  const result = useMemo(() => computeEstimate(config as any, selections), [config, selections]);

  // Helpers
  const currency = result.currency === "EUR" ? "€" : result.currency === "USD" ? "$" : result.currency;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Website Cost Calculator (Demo)</h1>
        <p className="mt-2 text-neutral-400">Minimal, extendable. Switch country, adjust levers, see P50/P80.</p>

        {/* Country */}
        <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-neutral-800 p-5">
            <label className="text-sm text-neutral-300">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-2 w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2"
            >
              {config.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-neutral-500">
              Currency: {config.countries.find(c => c.code === country)?.currency}
            </p>
          </div>

          {/* Pages */}
          <NumberLever
            label="Unique Page Templates"
            id="pages_unique"
            min={1}
            max={50}
            value={selections["pages_unique"] ?? 6}
            onChange={(v) => setSelections(s => ({ ...s, pages_unique: v }))}
          />

          {/* Languages */}
          <NumberLever
            label="Languages"
            id="i18n_locales"
            min={1}
            max={12}
            value={selections["i18n_locales"] ?? 1}
            onChange={(v) => setSelections(s => ({ ...s, i18n_locales: v }))}
          />
        </section>

        {/* Selects */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <SelectLever
            label="CMS"
            id="cms_choice"
            options={[
              { value: "none", label: "No CMS" },
              { value: "wordpress", label: "WordPress" },
              { value: "sanity", label: "Sanity (Headless)" },
            ]}
            value={selections["cms_choice"] ?? "sanity"}
            onChange={(v) => setSelections(s => ({ ...s, cms_choice: v }))}
          />
          <SelectLever
            label="Timeline Pressure"
            id="timeline_pressure"
            options={[
              { value: "normal", label: "Normal" },
              { value: "rush10", label: "Rush (+10%)" },
              { value: "rush20", label: "Rush (+20%)" },
            ]}
            value={selections["timeline_pressure"] ?? "normal"}
            onChange={(v) => setSelections(s => ({ ...s, timeline_pressure: v }))}
          />
          <SelectLever
            label="Risk Level"
            id="risk_level"
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
            value={selections["risk_level"] ?? "medium"}
            onChange={(v) => setSelections(s => ({ ...s, risk_level: v }))}
          />
        </section>

        {/* Output */}
        <section className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="P50 (Most Likely)">
            <BigNumber label="Hours" value={result.p50.hours.toFixed(1)} />
            <BigNumber label="Cost" value={`${currency}${formatMoney(result.p50.cost)}`} />
          </Card>

          <Card title="P80 (With Risk)">
            <BigNumber label="Hours" value={result.p80.hours.toFixed(1)} />
            <BigNumber label="Cost" value={`${currency}${formatMoney(result.p80.cost)}`} />
          </Card>

          <Card title="Breakdown (Key Roles)">
            <ListRow label="Design" value={`${result.hoursByRole.design.toFixed(1)} h`} />
            <ListRow label="Frontend" value={`${result.hoursByRole.frontend.toFixed(1)} h`} />
            <ListRow label="Backend" value={`${result.hoursByRole.backend.toFixed(1)} h`} />
            <ListRow label="Content" value={`${result.hoursByRole.content.toFixed(1)} h`} />
            <ListRow label="SEO" value={`${result.hoursByRole.seo.toFixed(1)} h`} />
            <ListRow label="DevOps" value={`${result.hoursByRole.devops.toFixed(1)} h`} />
            <div className="mt-3 h-px bg-neutral-800" />
            <ListRow label="PM (overhead)" value={`${result.overheads.pmHours.toFixed(1)} h`} />
            <ListRow label="QA (overhead)" value={`${result.overheads.qaHours.toFixed(1)} h`} />
          </Card>
        </section>

        <p className="mt-8 text-sm text-neutral-500">
          Demo logic supports: option hours, hoursPerUnit, i18n base/extra, multipliers, PM/QA, and risk bands.
          Swap in your full JSON later to scale up.
        </p>
      </div>
    </main>
  );
}

function NumberLever({
  label,
  id,
  value,
  onChange,
  min = 0,
  max = 100
}: {
  label: string;
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 p-5">
      <label htmlFor={id} className="text-sm text-neutral-300">{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2"
      />
    </div>
  );
}

function SelectLever({
  label,
  id,
  value,
  onChange,
  options
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="rounded-xl border border-neutral-800 p-5">
      <label htmlFor={id} className="text-sm text-neutral-300">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <h3 className="text-lg font-medium">{title}</h3>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function BigNumber({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
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

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
