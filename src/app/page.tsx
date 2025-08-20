"use client";

import { useEffect, useMemo, useState } from "react";
import cfgJson from "@/config/factors.json";
import {
  computeEstimate,
  visibleLeverIdSet,
  applyPreset as applyPresetLib,
  type Selections,
  type Lever
} from "@/lib/estimate";

type Cfg = typeof cfgJson;
type Role = "design" | "frontend" | "backend" | "pm" | "qa" | "devops" | "seo" | "content";
const BUILD_ROLES: Role[] = ["design", "frontend", "backend", "devops", "seo", "content"];

export default function Home() {
  const cfg = cfgJson as Cfg;

  // ---------- defaults ----------
  const defaults: Selections = useMemo(() => {
    const s: Selections = {
      _country: cfg.countries[0].code,
      _rateMode: cfg.ui?.pricing?.defaultRateMode ?? "country_roles",
      _blendedRate: cfg.ui?.pricing?.defaultBlendedRate ?? 85,
      _roleAdjust: {}
    };
    for (const l of cfg.levers) {
      const d = (l as any).default;
      if (d !== undefined) s[l.id] = d;
      if (l.type === "multiselect" && s[l.id] === undefined) s[l.id] = [];
    }
    return s;
  }, [cfg]);

  const [selections, setSelections] = useState<Selections>(defaults);
  const [country, setCountry] = useState<string>(cfg.countries[0].code);
  const [presetId, setPresetId] = useState<string>("");
  const [showRoleModal, setShowRoleModal] = useState(false);

  // country sync
  useEffect(() => { setSelections(prev => ({ ...prev, _country: country })); }, [country]);

  // dependencies → UI state
  useEffect(() => {
    const adjusted = applyDependenciesUI(cfg, selections).selections;
    if (!shallowEqual(adjusted, selections)) setSelections(adjusted);
  }, [selections, cfg]);

  // visible levers
  const visibleIds = useMemo(() => visibleLeverIdSet(cfg as any, selections), [cfg, selections]);

  // estimate (includes manual role adjustments)
  const result = useMemo(() => computeEstimate(cfg as any, selections), [cfg, selections]);
  const curr = result.currencySymbol;

  const rateMode = String(selections._rateMode ?? "country_roles");
  const blendedRate = Number(selections._blendedRate ?? cfg.ui?.pricing?.defaultBlendedRate ?? 85);
  const roleAdjust: Partial<Record<Role, number>> = selections._roleAdjust ?? {};

  // presets grouping from JSON is automatic
  const groups = cfg.ui?.groups ?? [];
  const groupOrder = groups.map(g => g.id);
  const leversByGroup = new Map<string, Lever[]>();
  for (const l of cfg.levers as Lever[]) {
    const gid = (l as any).group || "other";
    if (!leversByGroup.has(gid)) leversByGroup.set(gid, []);
    leversByGroup.get(gid)!.push(l);
  }

  const onReset = () => {
    setPresetId("");
    setCountry(cfg.countries[0].code);
    setSelections(defaults);
  };
  const onApplyPreset = (id: string) => {
    if (!id) return;
    setPresetId(id);
    const next = applyPresetLib(cfg as any, selections, id);
    setSelections({ ...next, _roleAdjust: {} }); // clear manual tweaks on preset
    setCountry(next._country || cfg.countries[0].code);
  };

  // ---------- render ----------
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Website Cost Calculator</h1>
            <p className="mt-2 text-neutral-400">Presets, help popovers, editable role breakdown.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Country */}
            <Select
              ariaLabel="Country"
              value={country}
              onChange={setCountry}
              options={cfg.countries.map(c => ({ value: c.code, label: c.name }))}
            />

            {/* Presets */}
            {cfg.presets?.length ? (
              <Select
                ariaLabel="Preset"
                value={presetId}
                onChange={(v) => onApplyPreset(v)}
                options={[{ value: "", label: "Load preset…" }, ...cfg.presets.map(p => ({ value: p.id, label: p.label }))]}
              />
            ) : null}

            {/* Rate Mode */}
            {cfg.ui?.pricing?.allowBlendedRate && (
              <>
                <Select
                  ariaLabel="Rate Mode"
                  value={rateMode}
                  onChange={(v) => setSelections(s => ({ ...s, _rateMode: v }))}
                  options={[
                    { value: "country_roles", label: "Use country role rates" },
                    { value: "blended", label: "Use blended hourly rate" }
                  ]}
                />
                {rateMode === "blended" && (
                  <NumberInline
                    id="_blendedRate"
                    label={`Hourly rate (${curr})`}
                    value={blendedRate}
                    min={0}
                    onChange={(v) => setSelections(s => ({ ...s, _blendedRate: v }))}
                  />
                )}
            </>
            )}

            <button onClick={onReset} className="rounded-lg border border-neutral-700 px-3 py-2 hover:bg-neutral-900">
              Reset
            </button>
          </div>
        </header>

        {/* -------- grouped form -------- */}
        <div className="mt-8 space-y-10">
          {groupOrder.map(gid => {
            const group = groups.find(g => g.id === gid);
            const levers = (leversByGroup.get(gid) ?? []).filter(l => visibleIds.has(l.id));
            if (levers.length === 0) return null;
            return (
              <section key={gid}>
                <h2 className="text-xl font-medium mb-4">{group?.label ?? gid}</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {levers.map((lever) => renderLeverCard(lever, selections, setSelections))}
                </div>
              </section>
            );
          })}
          {/* any ungrouped */}
          {(() => {
            const others = (leversByGroup.get("other") ?? []).filter(l => visibleIds.has(l.id));
            if (others.length === 0) return null;
            return (
              <section>
                <h2 className="text-xl font-medium mb-4">Other</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {others.map((lever) => renderLeverCard(lever, selections, setSelections))}
                </div>
              </section>
            );
          })()}
        </div>

        {/* ------- outputs ------- */}
        <section className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="P50 (Most Likely)">
            <BigNumber label="Hours" value={result.p50.hours.toFixed(1)} />
            <BigNumber label="Cost" value={`${curr}${fmtMoney(result.p50.cost)}`} />
          </Card>

          <Card title="P80 (With Risk)">
            <BigNumber label="Hours" value={result.p80.hours.toFixed(1)} />
            <BigNumber label="Cost" value={`${curr}${fmtMoney(result.p80.cost)}`} />
          </Card>

          <Card title="Breakdown (Key Roles)">
            <button
              onClick={() => setShowRoleModal(true)}
              className="w-full text-left"
              aria-label="Open role breakdown editor"
            >
              <ListRow label="Design" value={`${result.hoursByRole.design.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.design)})`} />
              <ListRow label="Frontend" value={`${result.hoursByRole.frontend.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.frontend)})`} />
              <ListRow label="Backend" value={`${result.hoursByRole.backend.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.backend)})`} />
              <ListRow label="Content" value={`${result.hoursByRole.content.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.content)})`} />
              <ListRow label="SEO" value={`${result.hoursByRole.seo.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.seo)})`} />
              <ListRow label="DevOps" value={`${result.hoursByRole.devops.toFixed(1)} h (${curr}${fmtMoney(result.costByRole.devops)})`} />
            </button>
            <div className="mt-3 h-px bg-neutral-800" />
            <ListRow label="PM (overhead)" value={`${result.overheads.pmHours.toFixed(1)} h (${curr}${fmtMoney(result.overheads.pmCost)})`} />
            <ListRow label="QA (overhead)" value={`${result.overheads.qaHours.toFixed(1)} h (${curr}${fmtMoney(result.overheads.qaCost)})`} />
          </Card>
        </section>

        {/* Assumptions / Exclusions */}
        <section className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Assumptions">
            <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
              {(cfg.assumptions ?? []).map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </Card>
          <Card title="Exclusions">
            <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-300">
              {(cfg.exclusions ?? []).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </Card>
        </section>

        <footer className="mt-8 text-xs text-neutral-500">
          Prices shown exclude VAT where applicable. Ranges: P50 (most likely) vs. P80 (incl. risk).
        </footer>
      </div>

      {/* -------- Role Breakdown Modal -------- */}
      {showRoleModal && (
        <Modal onClose={() => setShowRoleModal(false)} title="Edit Role Hours (deltas)">
          <p className="text-sm text-neutral-400 mb-3">
            Adjust hours per role (±0.5h steps). These deltas apply <em>before</em> PM/QA overheads.
          </p>
          <div className="space-y-3">
            {BUILD_ROLES.map((role) => {
              const current = Number((result.debug.preAdjustHours as any)[role] ?? 0);
              const delta = Number((roleAdjust as any)[role] ?? 0);
              const effective = current + delta;
              return (
                <div key={role} className="flex items-center justify-between gap-3">
                  <div className="w-36 capitalize">{role}</div>
                  <div className="text-xs text-neutral-500 w-28">base: {current.toFixed(1)} h</div>
                  <Stepper
                    value={delta}
                    step={0.5}
                    onChange={(v) => setSelections(s => ({ ...s, _roleAdjust: { ...(s._roleAdjust ?? {}), [role]: v } }))}
                  />
                  <div className="text-sm font-medium w-28 text-right">{effective.toFixed(1)} h</div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex justify-between">
            <button
              onClick={() => setSelections(s => ({ ...s, _roleAdjust: {} }))}
              className="rounded-lg border border-neutral-700 px-3 py-2 hover:bg-neutral-900"
            >
              Reset adjustments
            </button>
            <button
              onClick={() => setShowRoleModal(false)}
              className="rounded-lg bg-neutral-100 text-neutral-900 px-3 py-2"
            >
              Done
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

/* ---------- lever render (with help popover) ---------- */

function renderLeverCard(
  lever: Lever,
  selections: Selections,
  setSelections: (fn: (s: Selections) => Selections) => void
) {
  const key = lever.id;
  const help = (lever as any).help as string | undefined;

  if (lever.type === "number") {
    const val = Number(selections[lever.id] ?? (lever as any).default ?? 0);
    return (
      <FieldCard key={key} title={lever.label} help={help}>
        <NumberField
          id={lever.id}
          value={val}
          min={(lever as any).min}
          max={(lever as any).max}
          onChange={(v) =>
            setSelections((s) => ({ ...s, [lever.id]: clamp(v, (lever as any).min, (lever as any).max) }))
          }
        />
      </FieldCard>
    );
  }

  if (lever.type === "select") {
    const val = String(selections[lever.id] ?? (lever as any).default ?? (lever.options[0]?.value ?? ""));
    return (
      <FieldCard key={key} title={lever.label} help={help}>
        <SelectField
          id={lever.id}
          value={val}
          options={lever.options.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => setSelections((s) => ({ ...s, [lever.id]: v }))}
        />
      </FieldCard>
    );
  }

  if (lever.type === "multiselect") {
    const vals: string[] = Array.isArray(selections[lever.id]) ? selections[lever.id] : [];
    const maxSelected = (lever as any).maxSelected as number | undefined;
    return (
      <FieldCard key={key} title={lever.label} help={help}>
        <MultiSelectPills
          id={lever.id}
          values={vals}
          options={lever.options.map((o) => ({ value: o.value, label: o.label }))}
          maxSelected={maxSelected}
          onToggle={(v) => {
            setSelections((s) => {
              const current: string[] = Array.isArray(s[lever.id]) ? s[lever.id] : [];
              const exists = current.includes(v);
              let next = exists ? current.filter((x) => x !== v) : [...current, v];
              if (maxSelected && next.length > maxSelected) next = next.slice(0, maxSelected);
              return { ...s, [lever.id]: next };
            });
          }}
        />
      </FieldCard>
    );
  }

  return null;
}

/* ---------- UI atoms ---------- */

function FieldCard({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative rounded-xl border border-neutral-800 p-5">
      <div className="flex items-start justify-between">
        <label className="text-sm text-neutral-300">{title}</label>

        {/* centered ? badge */}
        {help ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-600 text-xs text-neutral-300 hover:bg-neutral-800"
            aria-label={`Help: ${title}`}
            title="More info"
          >
            <span className="leading-none">?</span>
          </button>
        ) : null}
      </div>

      {/* Popover */}
      {help && open && (
        <div className="absolute right-3 top-10 z-10 w-72 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm shadow-xl">
          <div className="font-medium mb-1">{title}</div>
          <div className="text-neutral-300">{help}</div>
          <div className="mt-2 text-right">
            <button
              className="text-xs text-neutral-400 hover:text-neutral-200"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">{children}</div>
    </div>
  );
}

function NumberField({ id, value, onChange, min, max }: { id: string; value: number; onChange: (v: number) => void; min?: number; max?: number; }) {
  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2"
    />
  );
}
function NumberInline({ id, label, value, onChange, min }: { id: string; label: string; value: number; onChange: (v: number) => void; min?: number; }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-300">
      {label}
      <input
        id={id}
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 rounded-lg bg-neutral-900 border border-neutral-700 p-2"
      />
    </label>
  );
}
function SelectField({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2"
    >
      {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
function MultiSelectPills({ id, values, options, onToggle, maxSelected }: { id: string; values: string[]; options: { value: string; label: string }[]; onToggle: (v: string) => void; maxSelected?: number; }) {
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`px-3 py-1 rounded-lg border transition
              ${active ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                       : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500"}`}
          >
            {o.label}
          </button>
        );
      })}
      {maxSelected && (<p className="w-full mt-2 text-xs text-neutral-500">Max {maxSelected} selections.</p>)}
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
function Select({ value, onChange, options, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel?: string; }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg bg-neutral-900 border border-neutral-700 p-2"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ---------- Modal & controls ---------- */

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full h-8 w-8 inline-flex items-center justify-center border border-neutral-700 hover:bg-neutral-900">×</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
function Stepper({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number; }) {
  return (
    <div className="flex items-center gap-2">
      <button className="h-8 w-8 rounded-lg border border-neutral-700 hover:bg-neutral-900" onClick={() => onChange(Number((value - step).toFixed(2)))}>−</button>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded-lg bg-neutral-900 border border-neutral-700 p-2 text-center"
        step={step}
      />
      <button className="h-8 w-8 rounded-lg border border-neutral-700 hover:bg-neutral-900" onClick={() => onChange(Number((value + step).toFixed(2)))}>+</button>
    </div>
  );
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
    for (const dep of cfg.dependencies ?? []) {
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
