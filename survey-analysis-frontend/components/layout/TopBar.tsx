"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ingestion } from "@/lib/api";
import type { SurveySchema } from "@/types";

export default function TopBar() {
  const { activeSurvey, setActiveSurvey, qualityFilterEnabled, toggleQualityFilter } =
    useAppStore();
  const [surveys, setSurveys] = useState<SurveySchema[]>([]);

  useEffect(() => {
    ingestion.listSchemas().then(setSurveys).catch(() => {});
  }, []);

  return (
    <header className="fixed top-0 left-[220px] right-0 h-16 bg-white/80 backdrop-blur-md border-b border-surface-200 flex items-center justify-between px-6 z-10">
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
            {surveys.map((s) => (
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
        {/* Quality Filter Toggle */}
        <button
          onClick={toggleQualityFilter}
          className="flex items-center gap-2 text-sm"
        >
          <span className="text-surface-500 text-xs font-medium">Quality Filter</span>
          <div
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
              qualityFilterEnabled ? "bg-brand-600" : "bg-surface-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                qualityFilterEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
        </button>

        {/* Refresh survey list */}
        <button
          onClick={() => ingestion.listSchemas().then(setSurveys).catch(() => {})}
          className="btn-ghost p-2"
          title="Refresh surveys"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </header>
  );
}