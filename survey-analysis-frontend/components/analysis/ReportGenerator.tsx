"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Download, Save, FileText, RefreshCw, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { reports } from "@/lib/api";
import { captureChartsById } from "@/lib/chart-capture";
import type { AnalysisResult, Report, SectionKey } from "@/types";
import { SECTION_KEYS, SECTION_TITLES } from "@/types";
import ReportSection from "./ReportSection";

// ── Loading Messages ────────────────────────────

const GENERATING_MESSAGES = [
  "Capturing charts…",
  "Writing executive summary…",
  "Composing findings…",
  "Analyzing quality metrics…",
  "Drafting recommendations…",
  "Formatting report sections…",
  "Polishing the final draft…",
];

type GeneratorState = "idle" | "generating" | "preview" | "exporting";

interface ReportGeneratorProps {
  analysisResult: AnalysisResult;
  surveyId: string;
  onClose: () => void;
}

export default function ReportGenerator({
  analysisResult,
  surveyId,
  onClose,
}: ReportGeneratorProps) {
  const { addToast } = useAppStore();

  const [state, setState] = useState<GeneratorState>("generating");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(GENERATING_MESSAGES[0]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ── Generate report on mount ───────────────────

  const generateReport = useCallback(async () => {
    setState("generating");
    setError(null);

    // Cycle loading messages
    let msgIndex = 0;
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % GENERATING_MESSAGES.length;
      setLoadingMsg(GENERATING_MESSAGES[msgIndex]);
    }, 2500);

    try {
      // Step 1: Capture chart images from pinned insights
      const pinIds = analysisResult.pinned_insights
        .filter((p) => p.chart_code && p.chart_data)
        .map((p) => `chart-pin-${p.id}`);

      let chartImages: Record<string, string> = {};
      if (pinIds.length > 0) {
        chartImages = await captureChartsById(pinIds);
      }

      // Step 2: Call backend to generate report
      const generated = await reports.generate({
        survey_schema_id: surveyId,
        chart_images: chartImages,
      });

      setReport(generated);
      setTitleDraft(generated.title);
      setState("preview");
      addToast("Report generated successfully", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Report generation failed";
      setError(msg);
      setState("idle");
      addToast("Failed to generate report", "error");
    } finally {
      clearInterval(interval);
    }
  }, [analysisResult, surveyId, addToast]);

  useEffect(() => {
    generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Section handlers ───────────────────────────

  const handleSaveSection = useCallback(
    async (sectionKey: SectionKey, content: string) => {
      if (!report) return;
      try {
        const updated = await reports.updateSection(report.id, sectionKey, content);
        setReport(updated);
        addToast("Section saved", "success");
      } catch {
        addToast("Failed to save section", "error");
      }
    },
    [report, addToast]
  );

  const handleRegenerateSection = useCallback(
    async (sectionKey: SectionKey) => {
      if (!report) return;
      try {
        const updated = await reports.regenerateSection(report.id, sectionKey);
        setReport(updated);
        addToast(`${SECTION_TITLES[sectionKey]} regenerated`, "success");
      } catch {
        addToast("Failed to regenerate section", "error");
      }
    },
    [report, addToast]
  );

  // ── Title editing ──────────────────────────────

  const handleSaveTitle = useCallback(async () => {
    if (!report || !titleDraft.trim()) return;
    try {
      // Save title by updating the title_page section placeholder
      // The title is stored on the report model — we update via section save
      // For now we keep it local until PDF export
      setReport((prev) => prev && { ...prev, title: titleDraft.trim() });
      setEditingTitle(false);
    } catch {
      addToast("Failed to update title", "error");
    }
  }, [report, titleDraft, addToast]);

  // ── PDF Download placeholder ───────────────────

  const handleDownloadPdf = useCallback(async () => {
    if (!report) return;
    setState("exporting");
    addToast("PDF export will be available in the next step", "info");
    // PDF generation is implemented in Task 9
    setTimeout(() => setState("preview"), 1500);
  }, [report, addToast]);

  // ── Close handler ──────────────────────────────

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ── Rendering ──────────────────────────────────

  // Generating state — full-screen overlay with spinner
  if (state === "generating") {
    return (
      <div className="fixed inset-0 z-50 bg-surface-900/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md w-full mx-4 text-center">
          <div className="relative w-20 h-20 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-surface-100" />
            <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <FileText size={24} className="text-brand-600" />
            </div>
          </div>
          <h2 className="text-xl font-display font-bold text-surface-800 mb-2">
            Generating Report
          </h2>
          <p className="text-sm text-surface-500 mb-4 animate-pulse">
            {loadingMsg}
          </p>
          <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full animate-progress" />
          </div>
          <p className="text-[11px] text-surface-400 mt-4">
            This may take 30–60 seconds
          </p>
        </div>
      </div>
    );
  }

  // Error / idle state with retry
  if (state === "idle" && error) {
    return (
      <div className="fixed inset-0 z-50 bg-surface-900/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <X size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-display font-bold text-surface-800 mb-2">
            Generation Failed
          </h2>
          <p className="text-sm text-surface-500 mb-6">{error}</p>
          <div className="flex items-center gap-3 justify-center">
            <button onClick={handleClose} className="btn-secondary text-sm px-5 py-2">
              Close
            </button>
            <button onClick={generateReport} className="btn-primary text-sm px-5 py-2">
              <RefreshCw size={14} className="mr-1.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Exporting state — overlay spinner
  if (state === "exporting") {
    return (
      <div className="fixed inset-0 z-50 bg-surface-900/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-sm w-full mx-4 text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-surface-100" />
            <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm font-medium text-surface-700">
            Preparing PDF download…
          </p>
        </div>
      </div>
    );
  }

  // Preview state — main report editor
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-50 bg-surface-50 flex flex-col animate-fade-in">
      {/* Header Bar */}
      <header className="bg-white border-b border-surface-200 px-6 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="bg-brand-100 p-2 rounded-lg text-brand-600 flex-shrink-0">
            <FileText size={20} />
          </div>

          {editingTitle ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") {
                    setTitleDraft(report.title);
                    setEditingTitle(false);
                  }
                }}
                className="flex-1 text-lg font-display font-bold bg-surface-50 border border-surface-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
              <button
                onClick={handleSaveTitle}
                className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => {
                  setTitleDraft(report.title);
                  setEditingTitle(false);
                }}
                className="p-1.5 bg-surface-200 text-surface-600 rounded-md hover:bg-surface-300 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setTitleDraft(report.title);
                setEditingTitle(true);
                setTimeout(() => titleInputRef.current?.focus(), 50);
              }}
              className="text-lg font-display font-bold text-surface-800 hover:text-brand-600 transition-colors truncate text-left"
              title="Click to edit title"
            >
              {report.title}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium uppercase tracking-wider">
            {report.status}
          </span>
          <button
            onClick={handleDownloadPdf}
            className="btn-secondary text-sm flex items-center gap-1.5 px-4 py-2"
          >
            <Download size={14} />
            Download PDF
          </button>
          <button
            onClick={handleClose}
            className="btn-secondary text-sm flex items-center gap-1.5 px-4 py-2"
          >
            <Save size={14} />
            Save & Exit
          </button>
          <button
            onClick={handleClose}
            className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Scrollable report body */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          {/* Metadata bar */}
          <div className="flex items-center gap-4 text-xs text-surface-400 pb-2 border-b border-surface-100">
            <span>
              Generated:{" "}
              {new Date(report.generated_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-surface-200">•</span>
            <span>
              Last updated:{" "}
              {new Date(report.updated_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-surface-200">•</span>
            <span>{SECTION_KEYS.length} sections</span>
          </div>

          {/* Report Sections */}
          {SECTION_KEYS.map((key) => {
            const content = report.sections[key] || "";
            // Find chart image for pinned insights section
            const chartImage =
              key === "pinned_insights"
                ? Object.values(report.chart_images)[0] || null
                : null;

            return (
              <ReportSection
                key={key}
                sectionKey={key}
                content={content}
                chartImage={chartImage}
                onSave={handleSaveSection}
                onRegenerate={handleRegenerateSection}
              />
            );
          })}

          {/* Chart Images Gallery (if any) */}
          {Object.keys(report.chart_images).length > 0 && (
            <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-surface-100 bg-surface-50/60">
                <h2 className="font-display font-semibold text-surface-800 text-base">
                  Captured Charts
                </h2>
                <p className="text-xs text-surface-400 mt-0.5">
                  {Object.keys(report.chart_images).length} chart
                  {Object.keys(report.chart_images).length === 1 ? "" : "s"}{" "}
                  embedded in this report
                </p>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(report.chart_images).map(([id, dataUrl]) => (
                  <div
                    key={id}
                    className="border border-surface-200 rounded-lg overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dataUrl}
                      alt={`Chart ${id}`}
                      className="w-full"
                    />
                    <div className="px-3 py-2 bg-surface-50 text-[11px] text-surface-400 truncate">
                      {id}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom spacing */}
          <div className="h-12" />
        </div>
      </main>
    </div>
  );
}
