"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { analytics } from "@/lib/api";
import type { AnalysisResult, AnalysisFinding } from "@/types";
import { cn, formatPValue } from "@/lib/utils";
import DescriptiveStatsSection from "@/components/analysis/DescriptiveStatsSection";
import QualitySummarySection from "@/components/analysis/QualitySummarySection";

// ── Loading Messages ────────────────────────────

const LOADING_MESSAGES = [
  "Reading your responses…",
  "Looking for patterns…",
  "Comparing different groups…",
  "Identifying key connections…",
  "Writing recommendations…",
  "Putting it all together…",
];

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
  // association
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
        {/* Strength bar */}
        <div
          className={cn(
            "w-1 self-stretch rounded-full flex-shrink-0 mt-0.5",
            finding.strength === "strong" && "bg-brand-500",
            finding.strength === "moderate" && "bg-blue-400",
            finding.strength === "weak" && "bg-surface-300"
          )}
        />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1.5">
            <DirectionIcon direction={finding.direction} />
            <StrengthBadge strength={finding.strength} />
          </div>

          {/* Headline */}
          <h3 className="text-sm font-semibold text-surface-800 mb-1.5">
            {finding.headline}
          </h3>

          {/* Explanation */}
          <p className="text-sm text-surface-600 leading-relaxed mb-3">
            {finding.explanation}
          </p>

          {/* Recommendation */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="text-xs text-amber-800 leading-relaxed">
              {finding.recommendation}
            </p>
          </div>

          {/* Technical details toggle */}
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
  const [running, setRunning] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);

  const handleAnalyze = async () => {
    if (!activeSurvey) {
      addToast("Select a survey first", "error");
      return;
    }

    setRunning(true);
    setResult(null);

    // Cycle loading messages
    let msgIndex = 0;
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIndex]);
    }, 3000);

    try {
      const res = await analytics.analyze(activeSurvey.id);
      setResult(res);
      addToast(
        `Analysis complete — ${res.stats.significant_findings} patterns found`,
        "success"
      );
    } catch {
      addToast("Analysis failed — check LLM API key and try again", "error");
    }

    clearInterval(interval);
    setRunning(false);
  };

  if (!activeSurvey) {
    return (
      <div className="card-padded text-center py-16 animate-fade-in">
        <p className="text-surface-500">Select a survey to run analysis.</p>
      </div>
    );
  }

  // ── Pre-analysis state ──
  if (!result && !running) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-24">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold text-surface-800 mb-2">
            Discover Patterns in Your Data
          </h2>
          <p className="text-sm text-surface-500 mb-8 leading-relaxed">
            Automatically find connections between your survey questions and get
            clear, actionable insights — no statistics knowledge required.
          </p>
          <button onClick={handleAnalyze} className="btn-primary text-base px-8 py-3">
            Analyze My Data
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ──
  if (running) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-24">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-surface-100" />
          <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-surface-600 font-medium animate-pulse">
          {loadingMsg}
        </p>
        <p className="text-xs text-surface-400 mt-2">
          This may take a minute for large datasets
        </p>
      </div>
    );
  }

  // ── Results ──
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Analysis Results</h1>
          <p className="text-surface-500 text-sm mt-1">
            Patterns and recommendations from your survey data
          </p>
        </div>
        <button onClick={handleAnalyze} disabled={running} className="btn-secondary text-sm">
          Re-analyze
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-padded text-center">
          <p className="text-2xl font-bold text-brand-700">{result.stats.total_responses}</p>
          <p className="text-xs text-surface-500 mt-1">Responses analyzed</p>
        </div>
        <div className="card-padded text-center">
          <p className="text-2xl font-bold text-emerald-600">{result.stats.significant_findings}</p>
          <p className="text-xs text-surface-500 mt-1">Patterns found</p>
        </div>
        <div className="card-padded text-center">
          <p className="text-2xl font-bold text-surface-600">{result.stats.pairs_analyzed}</p>
          <p className="text-xs text-surface-500 mt-1">Comparisons made</p>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="card-padded">
        <h2 className="text-sm font-display font-semibold text-surface-700 mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Summary
        </h2>
        <div className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
          {result.summary}
        </div>
      </div>

      {/* Descriptive Stats */}
      <DescriptiveStatsSection stats={result.descriptive_stats} />

      {/* Quality Summary */}
      <QualitySummarySection summary={result.quality_summary} />

      {/* Findings */}
      {result.findings.length > 0 ? (
        <div>
          <h2 className="text-sm font-display font-semibold text-surface-700 mb-3 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Key Findings
            <span className="text-xs font-normal text-surface-400">
              Sorted by importance
            </span>
          </h2>
          <div className="space-y-3">
            {result.findings.map((finding, i) => (
              <FindingCard key={i} finding={finding} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className="card-padded text-center py-10">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-surface-100 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-surface-600 mb-1">
            No Strong Patterns Detected
          </h3>
          <p className="text-xs text-surface-400 max-w-sm mx-auto leading-relaxed">
            This could mean responses are quite diverse, or the sample size may be too small
            for patterns to emerge clearly. Consider collecting more responses and trying again.
          </p>
        </div>
      )}
    </div>
  );
}