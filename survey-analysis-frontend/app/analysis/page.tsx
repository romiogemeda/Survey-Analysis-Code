"use client";

import { useEffect } from "react";
import { useAppStore, type AnalysisTab } from "@/lib/store";
import { ingestion, quality } from "@/lib/api";
import { cn } from "@/lib/utils";

// Tab components
import OverviewTab from "@/components/tabs/OverviewTab";
import UploadTab from "@/components/tabs/UploadTab";
import ResponsesTab from "@/components/tabs/ResponsesTab";
import QualityTab from "@/components/tabs/QualityTab";
import AnalyticsTab from "@/components/tabs/AnalyticsTab";
import ChartsTab from "@/components/tabs/ChartsTab";
import SimulationTab from "@/components/tabs/SimulationTab";
import ChatTab from "@/components/tabs/ChatTab";

const TABS: { id: AnalysisTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "upload", label: "Upload", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" },
  { id: "responses", label: "Responses", icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
  { id: "quality", label: "Quality", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "analytics", label: "Analytics", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { id: "charts", label: "Charts", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
  { id: "simulation", label: "Simulation", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: "chat", label: "Chat", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
];

export default function AnalysisPage() {
  const {
    activeSurvey,
    setActiveSurvey,
    activeTab,
    setActiveTab,
    qualityFilterEnabled,
    toggleQualityFilter,
    submissions,
    setSubmissions,
    qualityScores,
    setQualityScores,
    surveys,
    setSurveys,
    toasts,
    removeToast,
  } = useAppStore();

  // Load survey list
  useEffect(() => {
    ingestion.listSchemas().then(setSurveys).catch(() => { });
  }, []);

  // Load shared data when active survey changes
  useEffect(() => {
    if (!activeSurvey) {
      setSubmissions([]);
      setQualityScores(new Map());
      return;
    }

    ingestion.getSubmissions(activeSurvey.id, false).then((subs: any[]) => {
      setSubmissions(subs);
      // Load quality scores for all submissions
      const scoreMap = new Map<string, any>();
      const fetches = subs.map((sub: any) =>
        quality
          .getScore(sub.id)
          .then((s) => scoreMap.set(sub.id, s))
          .catch(() => { })
      );
      Promise.all(fetches).then(() => setQualityScores(new Map(scoreMap)));
    }).catch(() => { });
  }, [activeSurvey]);

  console.log("Active Survey:", activeSurvey);
  console.log("Submissions:", submissions);
  console.log("Quality Scores:", qualityScores);

  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar — survey selector + quality toggle */}
      <header className="h-14 bg-white/80 backdrop-blur-md border-b border-surface-200 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-surface-500 uppercase tracking-wide">
              Survey
            </label>
            <select
              className="input w-[280px] text-sm py-1.5"
              value={activeSurvey?.id || ""}
              onChange={(e) => {
                const found = surveys.find((s) => s.id === e.target.value);
                setActiveSurvey(found || null);
              }}
            >
              <option value="">Select a survey...</option>
              {(surveys || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} (v{s.version_id})
                </option>
              ))}
            </select>
          </div>
          {activeSurvey && (
            <span className="badge-info text-xs">
              {activeSurvey.question_definitions?.length || 0} questions
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button onClick={toggleQualityFilter} className="flex items-center gap-2 text-sm">
            <span className="text-surface-500 text-xs font-medium">Quality Filter</span>
            <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${qualityFilterEnabled ? "bg-brand-600" : "bg-surface-300"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${qualityFilterEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </button>
          <button
            onClick={() => ingestion.listSchemas().then(setSurveys).catch(() => { })}
            className="btn-ghost p-2"
            title="Refresh surveys"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="bg-white border-b border-surface-200 px-6 flex-shrink-0">
        <div className="flex gap-0.5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px",
                activeTab === tab.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300"
              )}
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content — all rendered, only active visible (preserves state) */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-[1400px] mx-auto">
          <div className={activeTab === "overview" ? "" : "hidden"}><OverviewTab /></div>
          <div className={activeTab === "upload" ? "" : "hidden"}><UploadTab /></div>
          <div className={activeTab === "responses" ? "" : "hidden"}><ResponsesTab /></div>
          <div className={activeTab === "quality" ? "" : "hidden"}><QualityTab /></div>
          <div className={activeTab === "analytics" ? "" : "hidden"}><AnalyticsTab /></div>
          <div className={activeTab === "charts" ? "" : "hidden"}><ChartsTab /></div>
          <div className={activeTab === "simulation" ? "" : "hidden"}><SimulationTab /></div>
          <div className={activeTab === "chat" ? "" : "hidden"}><ChatTab /></div>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto px-4 py-3 rounded-lg shadow-lg border flex items-center justify-between gap-4 animate-slide-in-right",
              toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                toast.type === "error" ? "bg-red-50 border-red-200 text-red-800" :
                  "bg-blue-50 border-blue-200 text-blue-800"
            )}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="text-current opacity-50 hover:opacity-100">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}