"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { Submission } from "@/types";
import type { UploadResult, AutoIngestResult } from "@/types";
import { cn, formatDate } from "@/lib/utils";
import { simulation, ingestion } from "@/lib/api";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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

  for (const sub of submissions) {
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
  if (dayMap.size === 0) {
    for (const sub of submissions) {
      const date = new Date(sub.received_at).toISOString().slice(0, 10);
      const entry = dayMap.get(date) || { started: 0, completed: 0 };
      entry.started++;
      entry.completed += sub.completed_at ? 1 : 0;
      dayMap.set(date, entry);
    }
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

// ─── Upload Data Section ──────────────────────────────────────────────────────

function UploadSection() {
  const {
    activeSurvey,
    setActiveSurvey,
    setSurveys,
    setSubmissions,
    addToast,
  } = useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<
    Array<{ filename: string; records: number; valid: number; schemaTitle?: string }>
  >([]);

  const uploadFiles = async (files: File[]) => {
    setUploading(true);

    for (const file of files) {
      try {
        if (activeSurvey) {
          // Existing survey — append data to it
          const result: UploadResult = await ingestion.uploadFile(activeSurvey.id, file);
          setResults((prev) => [
            { filename: file.name, records: result.total_records, valid: result.valid_records },
            ...prev,
          ]);
          addToast(
            `Uploaded ${file.name}: ${result.valid_records}/${result.total_records} valid`,
            "success"
          );
          // Reload shared submissions
          ingestion.getSubmissions(activeSurvey.id, false).then(setSubmissions).catch(() => {});
        } else {
          // No survey selected — auto-infer schema from file
          const result: AutoIngestResult = await ingestion.autoIngest(file);
          setResults((prev) => [
            {
              filename: file.name,
              records: result.total_records,
              valid: result.valid_records,
              schemaTitle: result.schema.title,
            },
            ...prev,
          ]);
          addToast(
            `Created "${result.schema.title}" with ${result.schema.question_definitions.length} questions · ${result.valid_records}/${result.total_records} records ingested`,
            "success"
          );
          // Update survey list and activate the new survey
          const updatedSchemas = await ingestion.listSchemas();
          setSurveys(updatedSchemas);
          setActiveSurvey(result.schema);
          // Load submissions for the new survey
          ingestion
            .getSubmissions(result.schema.id, false)
            .then(setSubmissions)
            .catch(() => {});
        }
      } catch {
        addToast(`Failed to upload ${file.name}`, "error");
      }
    }

    setUploading(false);
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      await uploadFiles(Array.from(e.dataTransfer.files));
    },
    [activeSurvey]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await uploadFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  return (
    <div className="card-padded space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="section-heading flex items-center gap-2">
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              className="text-blue-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Upload Data
          </h3>
          <p className="text-xs text-surface-500 mt-0.5">
            {activeSurvey
              ? `Appending to: ${activeSurvey.title} (v${activeSurvey.version_id})`
              : "Drop a file to auto-create a survey, or select one above to append data"}
          </p>
        </div>
      </div>

      {/* Auto-create hint when no survey selected */}
      {!activeSurvey && (
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-brand-50 border border-brand-100">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              className="text-brand-500"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-medium text-surface-800">Quick Start — Just drop a file</p>
            <p className="text-xs text-surface-500 mt-0.5">
              No survey selected. Upload a CSV or JSON and the system will automatically create a
              survey by inferring question types from your data columns.
            </p>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDragging
            ? "border-brand-400 bg-brand-50"
            : "border-surface-300 hover:border-surface-400"
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-100 flex items-center justify-center">
            <svg
              width="22"
              height="22"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-surface-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-surface-700">
              {uploading ? "Uploading…" : "Drag and drop files here, or click to browse"}
            </p>
            <p className="text-xs text-surface-400 mt-1">
              {activeSurvey
                ? "Supports .json and .csv files"
                : "Drop any .csv or .json — a survey will be created automatically"}
            </p>
          </div>
          <label className="btn-secondary cursor-pointer mt-1">
            <input
              type="file"
              accept=".json,.csv"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            Browse Files
          </label>
        </div>
      </div>

      {/* Upload history */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">
            Upload History
          </p>
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <div>
                  <span className="text-sm text-surface-700">{r.filename}</span>
                  {r.schemaTitle && (
                    <span className="text-xs text-brand-600 ml-2">
                      → created &quot;{r.schemaTitle}&quot;
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-surface-500">{r.records} total</span>
                <span className="badge-high">{r.valid} valid</span>
                {r.records - r.valid > 0 && (
                  <span className="badge-low">{r.records - r.valid} invalid</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inferred schema preview — shown after auto-ingest */}
      {activeSurvey &&
        activeSurvey.question_definitions.length > 0 &&
        results.some((r) => r.schemaTitle) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">
              Inferred Schema
            </p>
            <p className="text-xs text-surface-500">
              The system inferred these question types from your data. You can proceed to the other
              tabs to analyze, visualize, and explore your data.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              {activeSurvey.question_definitions.map((q) => (
                <div
                  key={q.question_id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-50 border border-surface-100"
                >
                  <div>
                    <span className="text-sm font-medium text-surface-800">{q.text}</span>
                    <span className="text-[10px] font-mono text-surface-400 ml-2">
                      {q.question_id}
                    </span>
                  </div>
                  <span
                    className={`badge text-[10px] ${
                      q.data_type === "INTERVAL"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : q.data_type === "OPEN_ENDED"
                        ? "bg-purple-50 text-purple-700 border border-purple-200"
                        : q.data_type === "ORDINAL"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : q.data_type === "BOOLEAN"
                        ? "bg-teal-50 text-teal-700 border border-teal-200"
                        : q.data_type === "IDENTIFIER"
                        ? "bg-surface-100 text-surface-500 border border-surface-300"
                        : q.data_type === "DATETIME"
                        ? "bg-cyan-50 text-cyan-700 border border-cyan-200"
                        : q.data_type === "MULTI_SELECT"
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        : "bg-surface-100 text-surface-600 border border-surface-200"
                    }`}
                  >
                    {q.data_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Format guide */}
      <details className="group">
        <summary className="text-xs font-semibold text-surface-500 uppercase tracking-wide cursor-pointer select-none flex items-center gap-1 hover:text-surface-700 transition-colors">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="transition-transform group-open:rotate-90"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Supported Formats
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-surface-700 mb-2">JSON</h4>
            <pre className="text-xs font-mono bg-surface-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">
{`[
  {"age": 25, "device": "Mobile",
   "satisfaction": 4, "feedback": "Great app!"},
  {"age": 42, "device": "Desktop",
   "satisfaction": 3, "feedback": "Needs work"}
]`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-surface-700 mb-2">CSV</h4>
            <pre className="text-xs font-mono bg-surface-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">
{`age,device,satisfaction,feedback
25,Mobile,4,Great app!
42,Desktop,3,Needs work`}
            </pre>
          </div>
        </div>
        <p className="text-xs text-surface-400 mt-3">
          Column names become question IDs. Types are inferred automatically: numeric → INTERVAL,
          few distinct values → ORDINAL, long text → OPEN_ENDED, else NOMINAL.
        </p>
      </details>
    </div>
  );
}

// ─── Main OverviewTab ─────────────────────────────────────────────────────────

export default function OverviewTab() {
  const { activeSurvey, submissions, qualityScores, setActiveTab } = useAppStore();

  const [simulatedResponses, setSimulatedResponses] = useState<any[]>([]);
  const [realSubmissionCount, setRealSubmissionCount] = useState<number>(0);

  useEffect(() => {
    if (!activeSurvey) return;

    Promise.all([
      simulation.getResponses(activeSurvey.id).catch(() => []),
      ingestion.getSubmissions(activeSurvey.id, false).catch(() => []),
    ]).then(([simRes, realSubs]) => {
      setSimulatedResponses(simRes);
      const rc = realSubs.filter((s) => s.raw_responses?._is_simulated !== true).length;
      setRealSubmissionCount(rc);
    });
  }, [activeSurvey]);

  const trendData = useMemo(() => buildTrendData(submissions), [submissions]);

  const completedCount = submissions.filter((s) => s.completed_at).length;
  const startedCount = submissions.filter((s) => s.started_at).length;
  const abandonedCount = startedCount - completedCount;
  const completionRate =
    startedCount > 0 ? Math.round((completedCount / startedCount) * 100) : 0;

  const gradeStats = useMemo(() => {
    const scores = Array.from(qualityScores.values());
    return {
      HIGH: scores.filter((s) => s.grade === "HIGH").length,
      MEDIUM: scores.filter((s) => s.grade === "MEDIUM").length,
      LOW: scores.filter((s) => s.grade === "LOW").length,
    };
  }, [qualityScores]);

  if (!activeSurvey) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Empty-state hero */}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
            <svg
              width="28"
              height="28"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-brand-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-display font-semibold text-surface-800">Select a Survey</h2>
          <p className="text-surface-500 mt-2 max-w-sm">
            Choose a survey from the dropdown above to see its dashboard — or drop a file below to
            create one instantly.
          </p>
        </div>

        {/* Upload section is always available even without a survey */}
        <UploadSection />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-bold text-surface-900">{activeSurvey.title}</h2>
        <p className="text-surface-500 text-sm mt-1">
          Version {activeSurvey.version_id} · Created {formatDate(activeSurvey.created_at)}
        </p>
      </div>

      {/* ── Upload Data Section ── */}
      <UploadSection />

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
          sub={`${
            activeSurvey.question_definitions?.filter((q) => q.data_type === "OPEN_ENDED").length ||
            0
          } open-ended`}
        />
      </div>

      {/* Response & Completion Trends */}
      {trendData.length > 1 && (
        <div className="card-padded">
          <h3 className="section-heading mb-1">Response &amp; Completion Trends</h3>
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
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setActiveTab("analytics")}
            className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="text-emerald-600"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-800">Run Analysis</p>
                <p className="text-xs text-surface-500">Correlations &amp; insights</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setActiveTab("charts")}
            className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="text-blue-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-800">View Charts</p>
                <p className="text-xs text-surface-500">Visualize your data</p>
              </div>
            </div>
          </button>
          {/* <button
            onClick={() => setActiveTab("chat")}
            className="card p-4 hover:shadow-elevated transition-shadow group cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="text-purple-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-800">Ask AI</p>
                <p className="text-xs text-surface-500">Natural language queries</p>
              </div>
            </div>
          </button> */}
        </div>
      </div>

      {/* Simulation Overview Widget */}
      <div className="card-padded bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border-purple-100/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="section-heading text-purple-950 flex items-center gap-2">
              <svg
                width="18"
                height="18"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                className="text-purple-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                />
              </svg>
              Simulation Overview
            </h3>
            <p className="text-xs text-purple-700/70 mt-1">
              Data composition of real vs. synthesized responses
            </p>
          </div>
          {simulatedResponses.length > 0 && (
            <button
              onClick={() => setActiveTab("simulation")}
              className="text-xs px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-lg shadow-sm hover:bg-purple-50 font-medium transition-colors"
            >
              Manage Simulation →
            </button>
          )}
        </div>

        {simulatedResponses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center bg-white/60 rounded-xl border border-white/80">
            <p className="text-sm text-surface-600 mb-3">
              No simulations yet — generate synthetic data to augment your analysis
            </p>
            <button
              onClick={() => setActiveTab("simulation")}
              className="text-sm px-4 py-2 bg-purple-600 text-white rounded-lg shadow-sm hover:bg-purple-700 font-medium transition-colors"
            >
              Go to Simulation →
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/60 rounded-xl p-4 border border-white/80">
                <p className="stat-label">Total Simulated Responses</p>
                <p className="stat-value text-purple-900 mt-1">{simulatedResponses.length}</p>
              </div>
              <div className="bg-white/60 rounded-xl p-4 border border-white/80">
                <p className="stat-label">Personas Used</p>
                <p className="stat-value text-purple-900 mt-1">
                  {new Set(simulatedResponses.map((r) => r.persona_id)).size}
                </p>
              </div>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Real Submissions", value: realSubmissionCount },
                      { name: "Simulated Submissions", value: simulatedResponses.length },
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label
                  >
                    <Cell fill="#4c6ef5" />
                    <Cell fill="#7950f2" />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e9ecef",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
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