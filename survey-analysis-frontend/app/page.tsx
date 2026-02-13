"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ingestion, quality, analytics, visualization } from "@/lib/api";
import type { Submission, QualityBatchResult, CorrelationResult, ChartPayload } from "@/types";
import { cn, formatDate } from "@/lib/utils";

function StatCard({
  label,
  value,
  sub,
  accent,
  delay,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  delay?: number;
}) {
  return (
    <div
      className={cn("card-padded animate-slide-up", delay && `stagger-${delay}`)}
    >
      <p className="stat-label">{label}</p>
      <p className={cn("stat-value mt-1", accent || "text-surface-900")}>
        {value}
      </p>
      {sub && <p className="text-xs text-surface-400 mt-1.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { activeSurvey } = useAppStore();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [qualityStats, setQualityStats] = useState<QualityBatchResult | null>(null);
  const [correlations, setCorrelations] = useState<CorrelationResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeSurvey) return;
    setLoading(true);
    const id = activeSurvey.id;
    Promise.allSettled([
      ingestion.getSubmissions(id),
      analytics.getCorrelations(id),
    ]).then(([subsRes, corrRes]) => {
      if (subsRes.status === "fulfilled") setSubmissions(subsRes.value);
      if (corrRes.status === "fulfilled") setCorrelations(corrRes.value);
      setLoading(false);
    });
  }, [activeSurvey]);

  if (!activeSurvey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-brand-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-semibold text-surface-800">
          Select a Survey
        </h2>
        <p className="text-surface-500 mt-2 max-w-sm">
          Choose a survey from the dropdown above to see its dashboard, or create a new one in the Surveys tab.
        </p>
      </div>
    );
  }

  const significantCorr = correlations.filter((c) => c.is_significant);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-surface-900">
          {activeSurvey.title}
        </h1>
        <p className="text-surface-500 text-sm mt-1">
          Version {activeSurvey.version_id} · Created {formatDate(activeSurvey.created_at)}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Submissions"
          value={submissions.length}
          sub={`${submissions.filter((s) => s.is_valid).length} valid`}
          accent="text-brand-700"
          delay={1}
        />
        <StatCard
          label="Questions"
          value={activeSurvey.question_definitions?.length || 0}
          sub={`${activeSurvey.question_definitions?.filter((q) => q.data_type === "OPEN_ENDED").length || 0} open-ended`}
          delay={2}
        />
        <StatCard
          label="Correlations"
          value={correlations.length}
          sub={`${significantCorr.length} significant`}
          accent={significantCorr.length > 0 ? "text-emerald-600" : undefined}
          delay={3}
        />
        <StatCard
          label="Status"
          value={submissions.length > 0 ? "Active" : "Empty"}
          sub="Data pipeline"
          accent={submissions.length > 0 ? "text-emerald-600" : "text-amber-600"}
          delay={4}
        />
      </div>

      {/* Quick Actions */}
      <div className="card-padded">
        <h3 className="section-heading mb-4">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          <a href="/upload" className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="text-blue-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-800">Upload Data</p>
                <p className="text-xs text-surface-500">Import JSON or CSV</p>
              </div>
            </div>
          </a>
          <a href="/analytics" className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="text-emerald-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-800">Run Analysis</p>
                <p className="text-xs text-surface-500">Correlations & insights</p>
              </div>
            </div>
          </a>
          <a href="/chat" className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="text-purple-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-800">Ask AI</p>
                <p className="text-xs text-surface-500">Natural language queries</p>
              </div>
            </div>
          </a>
        </div>
      </div>

      {/* Recent Submissions */}
      {submissions.length > 0 && (
        <div className="card-padded">
          <h3 className="section-heading mb-4">Recent Submissions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-100">
                  <th className="pb-3 pr-4">ID</th>
                  <th className="pb-3 pr-4">Format</th>
                  <th className="pb-3 pr-4">Valid</th>
                  <th className="pb-3 pr-4">Received</th>
                  <th className="pb-3">Responses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {submissions.slice(0, 8).map((sub) => (
                  <tr key={sub.id} className="hover:bg-surface-50 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-surface-500">
                      {sub.id.slice(0, 8)}...
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="badge-info">{sub.source_format}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {sub.is_valid ? (
                        <span className="badge-high">Valid</span>
                      ) : (
                        <span className="badge-low">Invalid</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-surface-600 text-xs">
                      {formatDate(sub.received_at)}
                    </td>
                    <td className="py-2.5 text-surface-600">
                      {Object.keys(sub.raw_responses).length} fields
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}