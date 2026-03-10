"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { analytics } from "@/lib/api";
import type { AnalysisResult, AnalysisFinding } from "@/types";
import { cn, formatPValue } from "@/lib/utils";
import DynamicChart from "./DynamicChart";
import ChatTab from "./ChatTab";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ── Strength Badge ──────────────────────────────

function StrengthBadge({ strength }: { strength: string }) {
  const styles = {
    strong: "bg-brand-100 text-brand-700 border-brand-200",
    moderate: "bg-blue-50 text-blue-600 border-blue-200",
    weak: "bg-surface-100 text-surface-500 border-surface-200",
  };
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
        styles[strength as keyof typeof styles] || styles.weak
      )}
    >
      {strength}
    </span>
  );
}

// ── Direction Indicator ─────────────────────────

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "positive") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 17l9.2-9.2M17 17V7H7" />
      </svg>
    );
  }
  if (direction === "negative") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 7l-9.2 9.2M7 7v10h10" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4-4m-4 4l4 4" />
    </svg>
  );
}

// ── Finding Card ────────────────────────────────

function FindingCard({ finding, index }: { finding: AnalysisFinding; index: number }) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="card p-5 animate-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-1 self-stretch rounded-full flex-shrink-0 mt-0.5",
            finding.strength === "strong" && "bg-brand-500",
            finding.strength === "moderate" && "bg-blue-400",
            finding.strength === "weak" && "bg-surface-300"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <DirectionIcon direction={finding.direction} />
            <StrengthBadge strength={finding.strength} />
          </div>
          <h3 className="text-sm font-semibold text-surface-800 mb-1.5">{finding.headline}</h3>
          <p className="text-sm text-surface-600 leading-relaxed mb-3">{finding.explanation}</p>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="text-xs text-amber-800 leading-relaxed">{finding.recommendation}</p>
          </div>
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className="mt-2.5 text-[10px] text-surface-400 hover:text-surface-600 transition-colors"
          >
            {showTechnical ? "Hide" : "Show"} technical details
          </button>
          {showTechnical && (
            <div className="mt-1.5 flex gap-4 text-[10px] font-mono text-surface-400">
              <span>Method: {finding.technical.method}</span>
              <span>Statistic: {finding.technical.statistic.toFixed(4)}</span>
              <span>p-value: {formatPValue(finding.technical.p_value)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────

export default function AnalyticsTab() {
  const { activeSurvey, addToast } = useAppStore();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [pinnedItems, setPinnedItems] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSurvey) {
      loadDashboard();
    }
  }, [activeSurvey]);

  const loadDashboard = async () => {
    try {
      const items = await analytics.getDashboard(activeSurvey.id);
      setPinnedItems(items);
    } catch (err) {
      console.error("Failed to load dashboard items", err);
    }
  };

  const handleAnalyze = async () => {
    if (!activeSurvey) return;
    setRunning(true);
    try {
      const res = await analytics.analyze(activeSurvey.id);
      setResult(res);
      addToast(`Analysis complete`, "success");
    } catch {
      addToast("Analysis failed", "error");
    } finally {
      setRunning(false);
    }
  };

  const handleUnpin = async (itemId: string) => {
    try {
      await analytics.unpinItem(itemId);
      setPinnedItems(prev => prev.filter(i => i.id !== itemId));
      addToast("Item removed from dashboard", "info");
    } catch {
      addToast("Failed to remove item", "error");
    }
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    setExporting(true);
    try {
      const element = dashboardRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();

      const imgProps = (pdf as any).getImageProperties(imgData);
      const canvasWidth = imgProps.width;
      const canvasHeight = imgProps.height;

      const ratio = pdfWidth / canvasWidth;
      const totalImgHeightInPDFUnits = canvasHeight * ratio;

      let heightLeft = totalImgHeightInPDFUnits;
      let position = 0;

      // First page
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, totalImgHeightInPDFUnits);
      heightLeft -= pdfPageHeight;

      // Subsequent pages
      while (heightLeft > 0) {
        pdf.addPage();
        position = heightLeft - totalImgHeightInPDFUnits;
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, totalImgHeightInPDFUnits);
        heightLeft -= pdfPageHeight;
      }

      pdf.save(`${activeSurvey?.title || "Survey"}_Analysis.pdf`);
      addToast("Full dashboard exported to PDF", "success");
    } catch (err) {
      console.error("PDF export failed", err);
      addToast("Failed to export PDF", "error");
    } finally {
      setExporting(false);
    }
  };

  if (!activeSurvey) {
    return (
      <div className="card-padded text-center py-16 animate-fade-in">
        <p className="text-surface-500">Select a survey to run analysis.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Main Dashboard Area */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        <div className="flex items-center justify-between sticky top-0 bg-surface-50 z-10 py-2">
          <div>
            <h1 className="text-2xl font-display font-bold">Analysis Dashboard</h1>
            <p className="text-surface-500 text-sm">Real-time insights and pinned reports</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              disabled={exporting || (pinnedItems.length === 0 && !result)}
              className="btn-secondary"
            >
              {exporting ? "Generating..." : "Export to PDF"}
            </button>
            <button onClick={() => setShowChat(!showChat)} className="btn-secondary">
              {showChat ? "Hide Chat" : "Open Assistant"}
            </button>
            <button onClick={handleAnalyze} disabled={running} className="btn-primary">
              {running ? "Analyzing..." : "Refresh Global Analysis"}
            </button>
          </div>
        </div>

        <div ref={dashboardRef} className="space-y-8 pb-12 bg-white p-6 rounded-2xl border border-surface-200">
          {/* Header in PDF */}
          <div className="hidden pdf-only flex items-center justify-between border-b pb-4 mb-6">
            <h2 className="text-xl font-bold">{activeSurvey.title} - Analysis Report</h2>
            <span className="text-xs text-surface-400">{new Date().toLocaleDateString()}</span>
          </div>

          {/* Stats Bar (if result exists) */}
          {result && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface-50 p-4 rounded-xl text-center border border-surface-100">
                <p className="text-2xl font-bold text-brand-700">{result.stats.total_responses}</p>
                <p className="text-xs text-surface-500 uppercase tracking-wider mt-1">Responses</p>
              </div>
              <div className="bg-surface-50 p-4 rounded-xl text-center border border-surface-100">
                <p className="text-2xl font-bold text-emerald-600">{result.stats.significant_findings}</p>
                <p className="text-xs text-surface-500 uppercase tracking-wider mt-1">Insights</p>
              </div>
              <div className="bg-surface-50 p-4 rounded-xl text-center border border-surface-100">
                <p className="text-2xl font-bold text-surface-600">{result.stats.pairs_analyzed}</p>
                <p className="text-xs text-surface-500 uppercase tracking-wider mt-1">Comparisons</p>
              </div>
            </div>
          )}

          {/* Pinned Items Grid */}
          {pinnedItems.length > 0 && (
            <div className="space-y-4">
              <h2 className="section-heading text-lg">Pinned Insights & Charts</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pinnedItems.map((item) => (
                  <div key={item.id} className="relative group card p-4 pt-8 bg-white border-surface-200 hover:border-brand-300 transition-all shadow-sm">
                    <button
                      onClick={() => handleUnpin(item.id)}
                      className="absolute top-2 right-2 p-1 text-surface-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Unpin from dashboard"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    {item.item_type === "CHART" ? (
                      <div className="min-h-[250px]">
                        <DynamicChart
                          code={item.content_json.chart_code}
                          data={item.content_json.chart_data}
                          chartType={item.content_json.chart_type}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-surface-700 italic border-l-2 border-brand-300 pl-4 py-2">
                        {item.content_json.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global Analysis Result (Summary & Findings) */}
          {result && (
            <div className="space-y-6">
              <div className="p-6 bg-brand-50 rounded-2xl border border-brand-100">
                <h2 className="section-heading text-brand-900 mb-4">Executive Summary</h2>
                <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{result.summary}</p>
              </div>

              <div className="space-y-4">
                <h2 className="section-heading">Key Automated Findings</h2>
                <div className="grid grid-cols-1 gap-4">
                  {result.findings.map((finding, i) => (
                    <FindingCard key={i} finding={finding} index={i} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {!result && pinnedItems.length === 0 && (
            <div className="text-center py-20 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
              <svg className="w-12 h-12 text-surface-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <h3 className="text-surface-600 font-medium font-display">Your dashboard is empty</h3>
              <p className="text-xs text-surface-500 mt-2 max-w-xs mx-auto">
                Run a global analysis or use the Chat Assistant to pin specific charts and insights here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Side Chat Assistant */}
      {showChat && (
        <div className="w-[450px] border-l border-surface-200 pl-6 flex flex-col animate-slide-in-right bg-white shadow-xl rounded-l-3xl p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-display font-bold text-surface-800">Chat Assistant</h3>
            <button onClick={() => setShowChat(false)} className="p-1 text-surface-400 hover:text-surface-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatTab compact={true} onPin={(item) => setPinnedItems(prev => [...prev, item])} />
          </div>
        </div>
      )}
    </div>
  );
}