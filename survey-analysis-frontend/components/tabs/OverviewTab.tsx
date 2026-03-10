"use client";

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import type { Submission } from "@/types";
import { cn, formatDate } from "@/lib/utils";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="card-padded">
      <p className="stat-label">{label}</p>
      <p className={cn("stat-value mt-1", accent || "text-surface-900")}>{value}</p>
      {sub && <p className="text-xs text-surface-400 mt-1.5">{sub}</p>}
    </div>
  );
}

/** Group submissions by date, counting started (response) vs completed */
function buildTrendData(submissions: Submission[]) {
  const dayMap = new Map<string, { started: number; completed: number }>();

  for (const sub of submissions || []) {
    // Response trend: group by started_at date
    const startDate = sub.started_at
      ? new Date(sub.started_at).toISOString().slice(0, 10)
      : null;
    // Completion trend: group by completed_at date
    const completeDate = sub.completed_at
      ? new Date(sub.completed_at).toISOString().slice(0, 10)
      : null;

    if (startDate) {
      const entry = dayMap.get(startDate) || { started: 0, completed: 0 };
      entry.started++;
      dayMap.set(startDate, entry);
    }

    if (completeDate) {
      const entry = dayMap.get(completeDate) || { started: 0, completed: 0 };
      entry.completed++;
      dayMap.set(completeDate, entry);
    }
  }

  // If no timestamp data, fall back to received_at for a basic volume chart
  for (const sub of submissions || []) {
    const date = new Date(sub.received_at).toISOString().slice(0, 10);
    const entry = dayMap.get(date) || { started: 0, completed: 0 };
    entry.started++;
    entry.completed += sub.completed_at ? 1 : 0;
    dayMap.set(date, entry);
  }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      label: new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      started: counts.started,
      completed: counts.completed,
      rate:
        counts.started > 0
          ? Math.round((counts.completed / counts.started) * 100)
          : 0,
    }));
}

export default function OverviewTab() {
  const { activeSurvey, submissions, qualityScores, setActiveTab } = useAppStore();

  const trendData = useMemo(() => buildTrendData(submissions), [submissions]);

  const completedCount = (submissions || []).filter((s) => s.completed_at).length;
  const startedCount = (submissions || []).filter((s) => s.started_at).length;
  const abandonedCount = startedCount - completedCount;
  const completionRate =
    startedCount > 0 ? Math.round((completedCount / startedCount) * 100) : 0;

  const gradeStats = useMemo(() => {
    const scores = Array.from((qualityScores || new Map()).values());
    return {
      HIGH: scores.filter((s) => s.grade === "HIGH").length,
      MEDIUM: scores.filter((s) => s.grade === "MEDIUM").length,
      LOW: scores.filter((s) => s.grade === "LOW").length,
    };
  }, [qualityScores]);

  if (!activeSurvey) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-brand-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-semibold text-surface-800">
          Select a Survey
        </h2>
        <p className="text-surface-500 mt-2 max-w-sm">
          Choose a survey from the dropdown above to see its dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-bold text-surface-900">
          {activeSurvey.title}
        </h2>
        <p className="text-surface-500 text-sm mt-1">
          Version {activeSurvey.version_id} · Created {formatDate(activeSurvey.created_at)}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Responses"
          value={startedCount || submissions.length}
          sub={`${submissions.filter((s) => s.is_valid).length} valid`}
          accent="text-brand-700"
        />
        <StatCard
          label="Completed"
          value={completedCount || "—"}
          sub={startedCount > 0 ? `${completionRate}% completion rate` : "No timestamp data"}
          accent="text-emerald-600"
        />
        <StatCard
          label="Abandoned"
          value={startedCount > 0 ? abandonedCount : "—"}
          sub={startedCount > 0 ? `${100 - completionRate}% drop-off` : "Requires started_at"}
          accent={abandonedCount > 0 ? "text-amber-600" : "text-surface-400"}
        />
        <StatCard
          label="Questions"
          value={activeSurvey.question_definitions?.length || 0}
          sub={`${activeSurvey.question_definitions?.filter((q) => q.data_type === "OPEN_ENDED").length || 0} open-ended`}
        />
      </div>

      {/* Response & Completion Trends */}
      {trendData.length > 1 && (
        <div className="card-padded">
          <h3 className="section-heading mb-1">Response & Completion Trends</h3>
          <p className="text-xs text-surface-500 mb-4">
            Daily volume of surveys started vs completed
          </p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#868e96" }}
                  tickLine={false}
                  axisLine={{ stroke: "#dee2e6" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#868e96" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e9ecef",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    name === "started" ? "Started" : "Completed",
                  ]}
                />
                <Legend
                  formatter={(value) =>
                    value === "started" ? "Responses (Started)" : "Completions (Submitted)"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="started"
                  stroke="#4c6ef5"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#4c6ef5" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="#37b24d"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#37b24d" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Completion Rate Over Time (bar chart) */}
      {trendData.length > 1 && trendData.some((d) => d.rate > 0) && (
        <div className="card-padded">
          <h3 className="section-heading mb-1">Daily Completion Rate</h3>
          <p className="text-xs text-surface-500 mb-4">
            Percentage of respondents who submitted each day
          </p>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#868e96" }}
                  tickLine={false}
                  axisLine={{ stroke: "#dee2e6" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#868e96" }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e9ecef",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`${value}%`, "Completion Rate"]}
                />
                <Bar dataKey="rate" fill="#37b24d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card-padded">
        <h3 className="section-heading mb-4">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setActiveTab("upload")}
            className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer text-left"
          >
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
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer text-left"
          >
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
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer text-left"
          >
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
          </button>
        </div>
      </div>

      {/* Recent Submissions */}
      {submissions.length > 0 && (
        <div className="card-padded">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-heading">Recent Submissions</h3>
            <button
              onClick={() => setActiveTab("responses")}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-100">
                  <th className="pb-3 pr-4">ID</th>
                  <th className="pb-3 pr-4">Format</th>
                  <th className="pb-3 pr-4">Valid</th>
                  <th className="pb-3 pr-4">Started</th>
                  <th className="pb-3">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {submissions.slice(0, 8).map((sub) => (
                  <tr key={sub.id} className="hover:bg-surface-50 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-surface-500">
                      {sub.id.slice(0, 8)}…
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
                    <td className="py-2.5 pr-4 text-xs text-surface-600">
                      {sub.started_at ? formatDate(sub.started_at) : "—"}
                    </td>
                    <td className="py-2.5 text-xs">
                      {sub.completed_at ? (
                        <span className="text-emerald-600">{formatDate(sub.completed_at)}</span>
                      ) : (
                        <span className="text-amber-500">Abandoned</span>
                      )}
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