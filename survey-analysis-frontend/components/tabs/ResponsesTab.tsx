"use client";

import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { quality } from "@/lib/api";
import type { Submission, QualityScore, QuestionDefinition, QualityBatchResult } from "@/types";
import { cn, formatDate, gradeBadgeClass } from "@/lib/utils";

type SortField = "received_at" | "source_format" | "is_valid" | "grade" | "composite";
type SortDir = "asc" | "desc";
const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ResponsesTab() {
  const { activeSurvey, submissions, qualityScores, setQualityScores, addToast } = useAppStore();

  // ── Table state ────────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>("received_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterText, setFilterText] = useState("");
  const [filterValid, setFilterValid] = useState<"all" | "valid" | "invalid">("all");
  const [filterGrade, setFilterGrade] = useState<"all" | "HIGH" | "MEDIUM" | "LOW">("all");
  const [qualityFilterEnabled, setQualityFilterEnabled] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Quality scoring state ──────────────────────────────────────────────────
  const [scoring, setScoring] = useState(false);
  const [batchResult, setBatchResult] = useState<QualityBatchResult | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const questions: QuestionDefinition[] = activeSurvey?.question_definitions ?? [];

  // ── Batch scoring handler (from QualityTab) ────────────────────────────────
  const handleScoreBatch = async () => {
    if (!activeSurvey) return;
    setScoring(true);
    try {
      const result = await quality.scoreBatch(activeSurvey.id);
      setBatchResult(result);
      addToast(`Scored ${result.scored} submissions`, "success");
      // Reload scores into shared store
      const scoreMap = new Map(qualityScores);
      await Promise.all(
        submissions.map((sub) =>
          quality.getScore(sub.id).then((s) => scoreMap.set(sub.id, s)).catch(() => {})
        )
      );
      setQualityScores(new Map(scoreMap));
      setSummaryOpen(true); // auto-expand summary after scoring
    } catch {
      addToast("Scoring failed", "error");
    }
    setScoring(false);
  };

  // ── Grade distribution stats (from QualityTab) ────────────────────────────
  const gradeStats = useMemo(() => {
    const all = Array.from(qualityScores.values());
    return {
      HIGH: all.filter((s) => s.grade === "HIGH").length,
      MEDIUM: all.filter((s) => s.grade === "MEDIUM").length,
      LOW: all.filter((s) => s.grade === "LOW").length,
    };
  }, [qualityScores]);
  const gradedTotal = gradeStats.HIGH + gradeStats.MEDIUM + gradeStats.LOW;

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...submissions];

    // Quality-filter toggle: hide LOW-grade responses when enabled
    if (qualityFilterEnabled) {
      rows = rows.filter((r) => {
        const grade = qualityScores.get(r.id)?.grade;
        // keep unscored rows (they haven't been classified yet) and HIGH/MEDIUM
        return !grade || grade === "HIGH" || grade === "MEDIUM";
      });
    }

    if (filterValid === "valid") rows = rows.filter((r) => r.is_valid);
    if (filterValid === "invalid") rows = rows.filter((r) => !r.is_valid);
    if (filterGrade !== "all") {
      rows = rows.filter((r) => qualityScores.get(r.id)?.grade === filterGrade);
    }
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      rows = rows.filter((r) => {
        const vals = Object.values(r.raw_responses).map((v) => String(v).toLowerCase());
        return vals.some((v) => v.includes(q)) || r.id.toLowerCase().includes(q);
      });
    }
    return rows;
  }, [submissions, filterValid, filterGrade, filterText, qualityScores, qualityFilterEnabled]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortField === "received_at")
        cmp = new Date(a.received_at).getTime() - new Date(b.received_at).getTime();
      else if (sortField === "source_format")
        cmp = a.source_format.localeCompare(b.source_format);
      else if (sortField === "is_valid") cmp = Number(a.is_valid) - Number(b.is_valid);
      else if (sortField === "grade") {
        const order = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        cmp =
          (order[qualityScores.get(a.id)?.grade as keyof typeof order] ?? 0) -
          (order[qualityScores.get(b.id)?.grade as keyof typeof order] ?? 0);
      } else if (sortField === "composite") {
        cmp =
          (qualityScores.get(a.id)?.composite_score ?? 0) -
          (qualityScores.get(b.id)?.composite_score ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortField, sortDir, qualityScores]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-surface-300 ml-1">↕</span>;
    return <span className="text-brand-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  if (!activeSurvey) {
    return (
      <div className="card-padded text-center py-16">
        <p className="text-surface-500">Select a survey to view responses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="card-padded">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <input
            type="text"
            value={filterText}
            onChange={(e) => { setFilterText(e.target.value); setPage(1); }}
            placeholder="Search responses..."
            className="input flex-1 min-w-[200px]"
          />

          {/* Validity filter */}
          <select
            value={filterValid}
            onChange={(e) => { setFilterValid(e.target.value as typeof filterValid); setPage(1); }}
            className="input w-auto"
          >
            <option value="all">All validity</option>
            <option value="valid">Valid only</option>
            <option value="invalid">Invalid only</option>
          </select>

          {/* Grade filter dropdown */}
          <select
            value={filterGrade}
            onChange={(e) => { setFilterGrade(e.target.value as typeof filterGrade); setPage(1); }}
            className="input w-auto"
          >
            <option value="all">All grades</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Page size */}
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="input w-auto"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>

          <span className="text-xs text-surface-500 whitespace-nowrap">
            {filtered.length} of {submissions.length}
          </span>

          {/* ── Quality Filter toggle ──────────────────────────────────────── */}
          <button
            onClick={() => { setQualityFilterEnabled((v) => !v); setPage(1); }}
            className={cn(
              "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
              qualityFilterEnabled
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-surface-50 border-surface-200 text-surface-600 hover:bg-surface-100"
            )}
            title="Hide LOW-grade responses"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Quality Filter
            {qualityFilterEnabled && (
              <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            )}
          </button>

          {/* ── Score Quality button ───────────────────────────────────────── */}
          <button
            onClick={handleScoreBatch}
            disabled={scoring || submissions.length === 0}
            className={cn(
              "btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5",
              scoring && "opacity-70 cursor-not-allowed"
            )}
          >
            {scoring ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Scoring…
              </>
            ) : (
              <>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Score Quality
              </>
            )}
          </button>
        </div>

        {/* Last batch result summary line */}
        {batchResult && (
          <p className="text-xs text-surface-500 mt-2">
            Last run: <span className="font-medium text-surface-700">{batchResult.scored}</span> submissions scored
            · HIGH: {batchResult.grades.HIGH} · MEDIUM: {batchResult.grades.MEDIUM} · LOW: {batchResult.grades.LOW}
          </p>
        )}
      </div>

      {/* ── Responses Table ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {paginated.length === 0 ? (
          <div className="p-12 text-center text-surface-400">No submissions match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-100 bg-surface-50/50">
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none"
                    onClick={() => toggleSort("received_at")}
                  >
                    Received <SortIcon field="received_at" />
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none"
                    onClick={() => toggleSort("is_valid")}
                  >
                    Valid <SortIcon field="is_valid" />
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none"
                    onClick={() => toggleSort("grade")}
                  >
                    Grade <SortIcon field="grade" />
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none"
                    onClick={() => toggleSort("composite")}
                  >
                    Score <SortIcon field="composite" />
                  </th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {questions.slice(0, 3).map((q) => (
                    <th
                      key={q.question_id}
                      className="px-4 py-3 font-medium max-w-[140px] truncate"
                      title={q.text}
                    >
                      {q.text}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {paginated.map((sub) => {
                  const score = qualityScores.get(sub.id);
                  const isExpanded = expandedId === sub.id;
                  return (
                    <Fragment key={sub.id}>
                      <tr
                        className={cn(
                          "hover:bg-surface-50 transition-colors cursor-pointer",
                          isExpanded && "bg-brand-50/40"
                        )}
                        onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                      >
                        <td className="px-4 py-2.5 text-surface-400">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            className={cn("transition-transform duration-200", isExpanded && "rotate-90")}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-surface-500">
                          {sub.id.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-2.5 text-xs text-surface-600">
                          {formatDate(sub.received_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          {sub.is_valid ? (
                            <span className="text-emerald-600 text-xs font-medium">✓</span>
                          ) : (
                            <span className="text-red-500 text-xs font-medium">✗</span>
                          )}
                        </td>
                        {/* Grade badge — central feature merged from QualityTab */}
                        <td className="px-4 py-2.5">
                          {score ? (
                            <span className={gradeBadgeClass(score.grade)}>{score.grade}</span>
                          ) : (
                            <span className="text-xs text-surface-400 italic">Not scored</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {score ? score.composite_score.toFixed(3) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {sub.completed_at ? (
                            <span className="text-emerald-600">Completed</span>
                          ) : sub.started_at ? (
                            <span className="text-amber-500">Abandoned</span>
                          ) : (
                            <span className="text-surface-400">—</span>
                          )}
                        </td>
                        {questions.slice(0, 3).map((q) => (
                          <td
                            key={q.question_id}
                            className="px-4 py-2.5 text-xs max-w-[140px] truncate"
                          >
                            {String(sub.raw_responses[q.question_id] ?? "—")}
                          </td>
                        ))}
                      </tr>

                      {/* Expanded row detail */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={100} className="bg-surface-50/70 border-b border-surface-200">
                            <div className="px-6 py-5 space-y-5">
                              <div className="flex flex-wrap gap-6 text-xs">
                                <div>
                                  <span className="text-surface-400 block mb-0.5">ID</span>
                                  <span className="font-mono text-surface-700">{sub.id}</span>
                                </div>
                                <div>
                                  <span className="text-surface-400 block mb-0.5">Started</span>
                                  <span className="text-surface-700">
                                    {sub.started_at ? formatDate(sub.started_at) : "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-surface-400 block mb-0.5">Completed</span>
                                  <span className="text-surface-700">
                                    {sub.completed_at ? formatDate(sub.completed_at) : "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-surface-400 block mb-0.5">Format</span>
                                  <span className="badge-info">{sub.source_format}</span>
                                </div>
                              </div>

                              {/* Score bar chart (from QualityTab expanded detail) */}
                              {score && (
                                <div className="flex flex-wrap gap-4">
                                  {[
                                    { l: "Composite", v: score.composite_score, c: "bg-brand-500" },
                                    { l: "Speed", v: score.speed_score, c: "bg-blue-500" },
                                    { l: "Variance", v: score.variance_score, c: "bg-emerald-500" },
                                    { l: "Gibberish", v: score.gibberish_score, c: "bg-amber-500" },
                                  ].map(({ l, v, c }) => (
                                    <div key={l} className="flex items-center gap-2">
                                      <span className="text-xs text-surface-500 w-20">{l}</span>
                                      <div className="w-24 h-2 rounded-full bg-surface-200">
                                        <div
                                          className={cn("h-full rounded-full", c)}
                                          style={{ width: `${Math.min(100, v * 100)}%` }}
                                        />
                                      </div>
                                      <span className="text-xs font-mono text-surface-600 w-10">
                                        {v.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Per-question response cards */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {questions.map((q) => (
                                  <div
                                    key={q.question_id}
                                    className="bg-white rounded-lg border border-surface-100 p-3"
                                  >
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                      <span className="text-xs font-medium text-surface-700">
                                        {q.text}
                                      </span>
                                      <span className="text-[10px] font-mono text-surface-400">
                                        {q.data_type}
                                      </span>
                                    </div>
                                    <p className="text-sm text-surface-800">
                                      {String(sub.raw_responses[q.question_id] ?? "—")}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              <details className="text-xs">
                                <summary className="cursor-pointer text-surface-400 hover:text-surface-600">
                                  Raw JSON
                                </summary>
                                <pre className="mt-2 bg-surface-900 text-surface-100 rounded-lg p-4 overflow-x-auto font-mono text-xs">
                                  {JSON.stringify(sub.raw_responses, null, 2)}
                                </pre>
                              </details>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100 bg-surface-50/30">
            <span className="text-xs text-surface-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
              >
                First
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pn: number;
                if (totalPages <= 5) pn = i + 1;
                else if (page <= 3) pn = i + 1;
                else if (page >= totalPages - 2) pn = totalPages - 4 + i;
                else pn = page - 2 + i;
                return (
                  <button
                    key={pn}
                    onClick={() => setPage(pn)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded",
                      page === pn ? "bg-brand-600 text-white" : "btn-ghost"
                    )}
                  >
                    {pn}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
              >
                Next →
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Quality Summary (collapsible, from QualityTab) ────────────────────── */}
      <div className="card-padded">
        <button
          className="flex items-center justify-between w-full group"
          onClick={() => setSummaryOpen((v) => !v)}
        >
          <h3 className="section-heading flex items-center gap-2">
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              className="text-surface-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Quality Summary
            {gradedTotal > 0 && (
              <span className="text-xs font-normal text-surface-400 ml-1">
                ({gradedTotal} scored)
              </span>
            )}
          </h3>
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            className={cn(
              "text-surface-400 transition-transform duration-200",
              summaryOpen && "rotate-180"
            )}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {summaryOpen && (
          <div className="mt-4 space-y-4 animate-fade-in">
            {gradedTotal === 0 ? (
              <div className="text-center py-8 text-surface-400 text-sm">
                <p>No quality scores yet.</p>
                <p className="text-xs mt-1">
                  Click <span className="font-semibold">Score Quality</span> above to evaluate submissions.
                </p>
              </div>
            ) : (
              <>
                {/* Grade stat cards */}
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      { label: "HIGH", count: gradeStats.HIGH, color: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500" },
                      { label: "MEDIUM", count: gradeStats.MEDIUM, color: "text-amber-600", bg: "bg-amber-50", bar: "bg-amber-400" },
                      { label: "LOW", count: gradeStats.LOW, color: "text-red-600", bg: "bg-red-50", bar: "bg-red-400" },
                    ] as const
                  ).map(({ label, count, color, bg }) => (
                    <div key={label} className={cn("rounded-xl p-4 border", bg)}>
                      <p className="text-xs font-medium text-surface-500">
                        <span className={gradeBadgeClass(label)}>{label}</span>
                      </p>
                      <p className={cn("text-2xl font-bold mt-1", color)}>{count}</p>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {gradedTotal > 0 ? Math.round((count / gradedTotal) * 100) : 0}% of scored
                      </p>
                    </div>
                  ))}
                </div>

                {/* Grade distribution bar */}
                <div>
                  <p className="text-xs text-surface-500 mb-2 font-medium">Grade Distribution</p>
                  <div className="h-4 rounded-full overflow-hidden flex bg-surface-100">
                    {gradeStats.HIGH > 0 && (
                      <div
                        className="bg-emerald-500 transition-all duration-500"
                        style={{ width: `${(gradeStats.HIGH / gradedTotal) * 100}%` }}
                        title={`HIGH: ${gradeStats.HIGH}`}
                      />
                    )}
                    {gradeStats.MEDIUM > 0 && (
                      <div
                        className="bg-amber-400 transition-all duration-500"
                        style={{ width: `${(gradeStats.MEDIUM / gradedTotal) * 100}%` }}
                        title={`MEDIUM: ${gradeStats.MEDIUM}`}
                      />
                    )}
                    {gradeStats.LOW > 0 && (
                      <div
                        className="bg-red-400 transition-all duration-500"
                        style={{ width: `${(gradeStats.LOW / gradedTotal) * 100}%` }}
                        title={`LOW: ${gradeStats.LOW}`}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-5 mt-2 text-xs text-surface-600">
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-emerald-500" /> High: {gradeStats.HIGH}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-amber-400" /> Medium: {gradeStats.MEDIUM}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-red-400" /> Low: {gradeStats.LOW}
                    </span>
                  </div>
                </div>

                {/* Coverage stat */}
                <p className="text-xs text-surface-400">
                  Coverage:{" "}
                  <span className="font-medium text-surface-600">
                    {gradedTotal} / {submissions.length}
                  </span>{" "}
                  submissions scored
                  {gradedTotal < submissions.length && (
                    <span className="ml-1 text-amber-600">
                      · {submissions.length - gradedTotal} unscored
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}