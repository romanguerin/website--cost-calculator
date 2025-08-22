"use client";

import React, { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { tLever, tOptionLabel } from "@/lib/i18n";
import factorsJson from "@/config/factors.json";
import countriesJson from "@/config/countries.json";
import pdfI18n from "@/config/pdf.i18n.json";
import type { Selections } from "@/lib/estimate";

/** ---- Types & helpers ---- */
type Cfg = typeof factorsJson & typeof countriesJson;
type Role = "design" | "frontend" | "backend" | "devops" | "seo" | "content" | "pm" | "qa";

export type ExportResult = {
  currencySymbol: string;
  p50: { hours: number; cost: number };
  p80: { hours: number; cost: number };
  hoursByRole: Record<Role, number>;
  costByRole: Record<Role, number>;
  overheads: { pmHours: number; pmCost: number; qaHours: number; qaCost: number };
};

export type ExportPdfDialogProps = {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  countryCode: string;
  selections: Selections;
  result: ExportResult;
  filenamePrefix?: string;
};

function composeCfg(): Cfg {
  return { ...(factorsJson as any), ...(countriesJson as any) };
}
function getCountryName(cfg: Cfg, code: string): string {
  return cfg.countries.find((c: any) => c.code === code)?.name ?? code;
}
function fmt(n: number, maxFrac = 1) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}
function humanizeSelections(cfg: Cfg, lang: Lang, selections: Selections) {
  const out: Record<string, string | string[]> = {};
  for (const lever of (cfg.levers as any[]) ?? []) {
    const id = lever.id as string;
    if (id.startsWith("_")) continue;
    const L = tLever(lang, id);
    const label = L.label ?? lever.label ?? id;
    const val = selections[id];
    if (lever.type === "number") out[label] = String(val ?? "");
    else if (lever.type === "select") {
      out[label] = tOptionLabel(lang, id, String(val ?? ""), String(val ?? ""));
    } else if (lever.type === "multiselect") {
      const arr: string[] = Array.isArray(val) ? val : [];
      out[label] = arr.map((v) => tOptionLabel(lang, id, v, v));
    }
  }
  return out;
}

/** i18n helpers (fallback → en) */
type PdfStrings = typeof pdfI18n.en;
function getPdfStrings(lang: Lang): PdfStrings {
  const l = (pdfI18n as any)[lang] as PdfStrings | undefined;
  return l ?? pdfI18n.en;
}

/** Pure helper: generate a PDF with i18n */
export async function generateEstimatePdf(opts: {
  lang: Lang;
  countryCode: string;
  selections: Selections;
  result: ExportResult;
  clientName?: string;
  devName?: string;
  filenamePrefix?: string;
}) {
  const { default: jsPDF } = await import("jspdf");

  const cfg = composeCfg();
  const t = getPdfStrings(opts.lang);
  const countryName = getCountryName(cfg, opts.countryCode);
  const selectionMap = humanizeSelections(cfg, opts.lang, opts.selections);
  const currency = opts.result.currencySymbol;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), m: 48 };
  let y = page.m;

  const addLine = (text: string, size = 11, bold = false, gap = 16) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const split = doc.splitTextToSize(text, page.w - page.m * 2);
    for (const line of split) {
      if (y > page.h - page.m) { doc.addPage(); y = page.m; }
      doc.text(line, page.m, y);
      y += gap;
    }
  };
  const addKV = (k: string, v: string) => addLine(`${k}: ${v}`, 11, false, 16);
  const addSection = (title: string) => {
    y += 8;
    addLine(title, 13, true, 18);
    doc.setDrawColor(180);
    doc.line(page.m, y - 10, page.w - page.m, y - 10);
    y += 2;
  };

  const now = new Date();
  const dateTag = now.toISOString().slice(0, 10);

  // Header
  addLine(t.pdf.title, 18, true, 22);
  addKV(t.pdf.fields.date, now.toLocaleString());

  // Meta
  addSection(t.pdf.sections.meta);
  if (opts.clientName) addKV(t.pdf.fields.client, opts.clientName);
  if (opts.devName) addKV(t.pdf.fields.developer, opts.devName);
  addKV(t.pdf.fields.language, opts.lang.toUpperCase());
  addKV(t.pdf.fields.country, `${countryName} (${opts.countryCode})`);
  addKV(t.pdf.fields.currency, currency);

  // Totals
  addSection(t.pdf.sections.totals);
  addKV(t.pdf.fields.p50h, fmt(opts.result.p50.hours));
  addKV(t.pdf.fields.p50c, `${currency}${fmt(opts.result.p50.cost, 0)}`);
  addKV(t.pdf.fields.p80h, fmt(opts.result.p80.hours));
  addKV(t.pdf.fields.p80c, `${currency}${fmt(opts.result.p80.cost, 0)}`);

  // Breakdown
  addSection(t.pdf.sections.breakdown);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  if (y > page.h - page.m) { doc.addPage(); y = page.m; }
  doc.text(t.pdf.fields.role, page.m, y);
  doc.text(t.pdf.fields.hours, page.w / 2, y);
  doc.text(t.pdf.fields.cost, page.w - page.m, y, { align: "right" });
  y += 14;
  doc.setFont("helvetica", "normal");

  const rows: Array<[string, string, string]> = [
    ["Design", fmt(opts.result.hoursByRole.design), `${currency}${fmt(opts.result.costByRole.design, 0)}`],
    ["Frontend", fmt(opts.result.hoursByRole.frontend), `${currency}${fmt(opts.result.costByRole.frontend, 0)}`],
    ["Backend", fmt(opts.result.hoursByRole.backend), `${currency}${fmt(opts.result.costByRole.backend, 0)}`],
    ["DevOps", fmt(opts.result.hoursByRole.devops), `${currency}${fmt(opts.result.costByRole.devops, 0)}`],
    ["SEO", fmt(opts.result.hoursByRole.seo), `${currency}${fmt(opts.result.costByRole.seo, 0)}`],
    ["Content", fmt(opts.result.hoursByRole.content), `${currency}${fmt(opts.result.costByRole.content, 0)}`],
    ["PM (overhead)", fmt(opts.result.overheads.pmHours), `${currency}${fmt(opts.result.overheads.pmCost, 0)}`],
    ["QA (overhead)", fmt(opts.result.overheads.qaHours), `${currency}${fmt(opts.result.overheads.qaCost, 0)}`],
  ];

  for (const [role, hours, cost] of rows) {
    if (y > page.h - page.m) { doc.addPage(); y = page.m; }
    doc.text(role, page.m, y);
    doc.text(hours, page.w / 2, y);
    doc.text(cost, page.w - page.m, y, { align: "right" });
    y += 16;
  }

  // Selections
  addSection(t.pdf.sections.selections);
  Object.entries(selectionMap).forEach(([label, v]) => {
    const value = Array.isArray(v) ? (v.length ? v.join(", ") : "—")
      : v === null || v === undefined || v === "" ? "—"
      : String(v);
    addLine(`${label}: ${value}`, 10, false, 14);
  });

  const safeClient = (opts.clientName || "client").replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
  const filePrefix =
    (opts.filenamePrefix || t.pdf.filenamePrefix || "codecost.io")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .toLowerCase();

  doc.save(`${filePrefix}_${safeClient}_${dateTag}.pdf`);
}

/** ---- Dialog component (i18n) ---- */
export default function ExportPdfDialog(props: ExportPdfDialogProps) {
  const { open, onClose, lang, countryCode, selections, result, filenamePrefix } = props;

  // Hooks first (stable order)
  const [clientName, setClientName] = useState("");
  const [devName, setDevName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const t = getPdfStrings(lang);

  const handleExport = async () => {
    try {
      setBusy(true);
      await generateEstimatePdf({
        lang, countryCode, selections, result,
        clientName, devName, filenamePrefix,
      });
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl p-5 sm:p-6 border shadow-2xl bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 dark:border-neutral-800 border-neutral-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">{t.dialog.exportTitle}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full h-8 w-8 inline-flex items-center justify-center border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            {t.dialog.clientLabel}
            <input
              type="text"
              className="mt-1 w-full rounded-lg p-2 border dark:border-neutral-700 dark:bg-neutral-900"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t.dialog.clientPlaceholder}
            />
          </label>
          <label className="text-sm">
            {t.dialog.devLabel}
            <input
              type="text"
              className="mt-1 w-full rounded-lg p-2 border dark:border-neutral-700 dark:bg-neutral-900"
              value={devName}
              onChange={(e) => setDevName(e.target.value)}
              placeholder={t.dialog.devPlaceholder}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-sm dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            {t.dialog.cancel}
          </button>
          <button
            onClick={handleExport}
            disabled={busy}
            className="rounded-lg border px-3 py-2 text-sm bg-neutral-900 text-white border-neutral-900 hover:opacity-90 disabled:opacity-60"
          >
            {busy ? t.dialog.generating : t.dialog.save}
          </button>
        </div>
      </div>
    </div>
  );
}
