"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { analytics } from "@/lib/api";
import type { CorrelationResult, Insight, ExecutiveSummary } from "@/types";
import { cn, formatPValue, gradeBadgeClass } from "@/lib/utils";

export default function AnalyticsTab() {
  const { activeSurvey, addToast } = useAppStore();
  const [correlations, setCorrelations] = useState<CorrelationResult[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [runningCorr, setRunningCorr] = useState(false);
  const [runningSummary, setRunningSummary] = useState(false);
  const [activeTab, setActiveTab] = useState<"correlations" | "insights" | "summary">("correlations");

  useEffect(() => {
    if (!activeSurvey) return;
    const id = activeSurvey.id;
    analytics.getCorrelations(id).then(setCorrelations).catch(() => {});
    analytics.getInsights(id).then(setInsights).catch(() => {});
    analytics.getSummary(id).then(setSummary).catch(() => {});
  }, [activeSurvey]);

  const handleRunCorrelations = async () => {
    if (!activeSurvey) return;
    setRunningCorr(true);
    try {
      const result = await analytics.runCorrelations(activeSurvey.id);
      setCorrelations(result.results);
      addToast(
        `Analyzed ${result.total_pairs_analyzed} pairs, ${result.significant} significant`,
        "success"
      );
      // Refresh insights
      analytics.getInsights(activeSurvey.id).then(setInsights).catch(() => {});
    } catch {
      addToast("Correlation analysis failed", "error");
    }
    setRunningCorr(false);
  };

  const handleGenerateSummary = async () => {
    if (!activeSurvey) return;
    setRunningSummary(true);
    try {
      const result = await analytics.generateSummary(activeSurvey.id);
      setSummary(result);
      addToast("Executive summary generated", "success");
    } catch {
      addToast("Summary generation failed — check LLM API key", "error");
    }
    setRunningSummary(false);
  };

  if (!activeSurvey) {
    return (
      <div className="card-padded text-center py-16 animate-fade-in">
        <p className="text-surface-500">Select a survey to run analytics.</p>
      </div>
    );
  }

  const significant = correlations.filter((c) => c.is_significant);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Analytics</h1>
          <p className="text-surface-500 text-sm mt-1">
            Correlation analysis, insights, and AI-generated executive summaries
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunCorrelations}
            disabled={runningCorr}
            className="btn-primary"
          >
            {runningCorr ? "Analyzing..." : "Run Correlations"}
          </button>
          <button
            onClick={handleGenerateSummary}
            disabled={runningSummary}
            className="btn-secondary"
          >
            {runningSummary ? "Generating..." : "AI Summary"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-padded">
          <p className="stat-label">Pairs Analyzed</p>
          <p className="stat-value text-brand-700">{correlations.length}</p>
        </div>
        <div className="card-padded">
          <p className="stat-label">Significant</p>
          <p className="stat-value text-emerald-600">{significant.length}</p>
        </div>
        <div className="card-padded">
          <p className="stat-label">Insights</p>
          <p className="stat-value text-amber-600">{insights.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-200">
        {(["correlations", "insights", "summary"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px capitalize",
              activeTab === tab
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-surface-500 hover:text-surface-700"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "correlations" && (
        <div className="card-padded animate-fade-in">
          {correlations.length === 0 ? (
            <p className="text-center py-8 text-surface-500">
              No correlations yet. Click &quot;Run Correlations&quot; to analyze.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-100">
                    <th className="pb-3 pr-4">Variable A</th>
                    <th className="pb-3 pr-4">Variable B</th>
                    <th className="pb-3 pr-4">Method</th>
                    <th className="pb-3 pr-4">Statistic</th>
                    <th className="pb-3 pr-4">p-value</th>
                    <th className="pb-3">Significant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {correlations.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        "hover:bg-surface-50 transition-colors",
                        c.is_significant && "bg-emerald-50/30"
                      )}
                    >
                      <td className="py-2.5 pr-4 font-medium">{c.independent_variable}</td>
                      <td className="py-2.5 pr-4 font-medium">{c.dependent_variable}</td>
                      <td className="py-2.5 pr-4">
                        <span className="badge-info text-[10px]">{c.method}</span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        {c.statistic_value.toFixed(4)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        {formatPValue(c.p_value)}
                      </td>
                      <td className="py-2.5">
                        {c.is_significant ? (
                          <span className="badge-high">Yes</span>
                        ) : (
                          <span className="text-xs text-surface-400">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "insights" && (
        <div className="space-y-3 animate-fade-in">
          {insights.length === 0 ? (
            <div className="card-padded text-center py-8 text-surface-500">
              No insights yet. Run correlations first.
            </div>
          ) : (
            insights.map((insight) => (
              <div
                key={insight.id}
                className="card p-4 flex items-start gap-3"
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                    insight.severity === "HIGH" && "bg-red-500",
                    insight.severity === "MEDIUM" && "bg-amber-500",
                    insight.severity === "LOW" && "bg-blue-400"
                  )}
                />
                <div className="flex-1">
                  <p className="text-sm text-surface-800">{insight.insight_text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={gradeBadgeClass(insight.severity)}>
                      {insight.severity}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "summary" && (
        <div className="card-padded animate-fade-in">
          {!summary ? (
            <div className="text-center py-8">
              <p className="text-surface-500 mb-3">No summary generated yet.</p>
              <button
                onClick={handleGenerateSummary}
                disabled={runningSummary}
                className="btn-primary"
              >
                {runningSummary ? "Generating..." : "Generate AI Summary"}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h3 className="section-heading">Executive Summary</h3>
                <span className="badge-info text-[10px]">
                  {summary.llm_model_used}
                </span>
              </div>
              <div className="prose prose-sm max-w-none text-surface-700 leading-relaxed whitespace-pre-wrap">
                {summary.summary_text}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}