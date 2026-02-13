"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ingestion, quality } from "@/lib/api";
import type { Submission, QualityScore, QuestionDefinition } from "@/types";
import { cn, formatDate, gradeBadgeClass } from "@/lib/utils";

// ── Sort / Filter types ───────────────────────

type SortField = "received_at" | "source_format" | "is_valid" | "grade" | "composite";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ResponsesPage() {
  const { activeSurvey, addToast } = useAppStore();

  // Data
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [scores, setScores] = useState<Map<string, QualityScore>>(new Map());
  const [loading, setLoading] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>("received_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Filter
  const [filterText, setFilterText] = useState("");
  const [filterValid, setFilterValid] = useState<"all" | "valid" | "invalid">("all");
  const [filterGrade, setFilterGrade] = useState<"all" | "HIGH" | "MEDIUM" | "LOW">("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Detail expansion (FR-13)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Questions for column headers
  const questions: QuestionDefinition[] = activeSurvey?.question_definitions ?? [];

  // ── Load data ──────────────────────────────

  useEffect(() => {
    if (!activeSurvey) return;
    setLoading(true);
    setExpandedId(null);
    setPage(1);

    ingestion
      .getSubmissions(activeSurvey.id, false)
      .then((subs) => {
        setSubmissions(subs);
        const scoreMap = new Map<string, QualityScore>();
        const fetches = subs.map((sub) =>
          quality
            .getScore(sub.id)
            .then((s) => scoreMap.set(sub.id, s))
            .catch(() => {})
        );
        Promise.all(fetches).then(() => setScores(new Map(scoreMap)));
      })
      .catch(() => addToast("Failed to load submissions", "error"))
      .finally(() => setLoading(false));
  }, [activeSurvey]);

  // ── Derived: filter → sort → paginate ──────

  const filtered = useMemo(() => {
    let rows = [...submissions];

    // Validity filter
    if (filterValid === "valid") rows = rows.filter((r) => r.is_valid);
    if (filterValid === "invalid") rows = rows.filter((r) => !r.is_valid);

    // Grade filter
    if (filterGrade !== "all") {
      rows = rows.filter((r) => {
        const s = scores.get(r.id);
        return s?.grade === filterGrade;
      });
    }

    // Free-text search across all response values
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      rows = rows.filter((r) => {
        const vals = Object.values(r.raw_responses).map((v) =>
          String(v).toLowerCase()
        );
        return (
          vals.some((v) => v.includes(q)) ||
          r.id.toLowerCase().includes(q)
        );
      });
    }

    return rows;
  }, [submissions, filterValid, filterGrade, filterText, scores]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortField === "received_at") {
        cmp = new Date(a.received_at).getTime() - new Date(b.received_at).getTime();
      } else if (sortField === "source_format") {
        cmp = a.source_format.localeCompare(b.source_format);
      } else if (sortField === "is_valid") {
        cmp = Number(a.is_valid) - Number(b.is_valid);
      } else if (sortField === "grade") {
        const order = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const gA = scores.get(a.id)?.grade;
        const gB = scores.get(b.id)?.grade;
        cmp = (order[gA as keyof typeof order] ?? 0) - (order[gB as keyof typeof order] ?? 0);
      } else if (sortField === "composite") {
        cmp = (scores.get(a.id)?.composite_score ?? 0) - (scores.get(b.id)?.composite_score ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortField, sortDir, scores]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  // ── Helpers ────────────────────────────────

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-surface-300 ml-1">↕</span>;
    return <span className="text-brand-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  // ── Empty state ────────────────────────────

  if (!activeSurvey) {
    return (
      <div className="card-padded text-center py-16 animate-fade-in">
        <p className="text-surface-500">Select a survey to view responses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold">Response Grid</h1>
        <p className="text-surface-500 text-sm mt-1">
          Browse, filter, sort, and drill into individual submissions
        </p>
      </div>

      {/* Toolbar: filters + search */}
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

          {/* Validity */}
          <select
            value={filterValid}
            onChange={(e) => { setFilterValid(e.target.value as typeof filterValid); setPage(1); }}
            className="input w-auto"
          >
            <option value="all">All validity</option>
            <option value="valid">Valid only</option>
            <option value="invalid">Invalid only</option>
          </select>

          {/* Grade */}
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
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>

          {/* Count */}
          <span className="text-xs text-surface-500 whitespace-nowrap">
            {filtered.length} of {submissions.length} submissions
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-surface-400">Loading...</div>
        ) : paginated.length === 0 ? (
          <div className="p-12 text-center text-surface-400">
            No submissions match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-100 bg-surface-50/50">
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none hover:text-surface-800"
                    onClick={() => toggleSort("received_at")}
                  >
                    Received <SortIcon field="received_at" />
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none hover:text-surface-800"
                    onClick={() => toggleSort("source_format")}
                  >
                    Format <SortIcon field="source_format" />
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none hover:text-surface-800"
                    onClick={() => toggleSort("is_valid")}
                  >
                    Valid <SortIcon field="is_valid" />
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none hover:text-surface-800"
                    onClick={() => toggleSort("grade")}
                  >
                    Grade <SortIcon field="grade" />
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer select-none hover:text-surface-800"
                    onClick={() => toggleSort("composite")}
                  >
                    Score <SortIcon field="composite" />
                  </th>
                  {/* Dynamic question columns */}
                  {questions.slice(0, 4).map((q) => (
                    <th key={q.question_id} className="px-4 py-3 font-medium max-w-[160px] truncate" title={q.text}>
                      {q.text}
                    </th>
                  ))}
                  {questions.length > 4 && (
                    <th className="px-4 py-3 font-medium text-surface-400">
                      +{questions.length - 4} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {paginated.map((sub) => {
                  const score = scores.get(sub.id);
                  const isExpanded = expandedId === sub.id;

                  return (
                    <Fragment key={sub.id}>
                      {/* Summary row */}
                      <tr
                        className={cn(
                          "hover:bg-surface-50 transition-colors cursor-pointer",
                          isExpanded && "bg-brand-50/40"
                        )}
                        onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                      >
                        <td className="px-4 py-2.5 text-surface-400">
                          <svg
                            width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth={2}
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
                          <span className="badge-info text-xs">{sub.source_format}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {sub.is_valid ? (
                            <span className="text-emerald-600 text-xs font-medium">✓ Valid</span>
                          ) : (
                            <span className="text-red-500 text-xs font-medium">✗ Invalid</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {score ? (
                            <span className={gradeBadgeClass(score.grade)}>{score.grade}</span>
                          ) : (
                            <span className="text-xs text-surface-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {score ? score.composite_score.toFixed(3) : "—"}
                        </td>
                        {questions.slice(0, 4).map((q) => (
                          <td key={q.question_id} className="px-4 py-2.5 text-xs max-w-[160px] truncate" title={String(sub.raw_responses[q.question_id] ?? "")}>
                            {String(sub.raw_responses[q.question_id] ?? "—")}
                          </td>
                        ))}
                        {questions.length > 4 && (
                          <td className="px-4 py-2.5 text-xs text-surface-400">…</td>
                        )}
                      </tr>

                      {/* FR-13: Expanded detail row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={100} className="bg-surface-50/70 border-b border-surface-200">
                            <SubmissionDetail
                              submission={sub}
                              score={score ?? null}
                              questions={questions}
                            />
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
              {/* Page number buttons */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded",
                      page === pageNum
                        ? "bg-brand-600 text-white"
                        : "btn-ghost"
                    )}
                  >
                    {pageNum}
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
    </div>
  );
}

// ── Need Fragment for key on adjacent rows ───
import { Fragment } from "react";

// ── FR-13: Full submission detail component ──

function SubmissionDetail({
  submission,
  score,
  questions,
}: {
  submission: Submission;
  score: QualityScore | null;
  questions: QuestionDefinition[];
}) {
  const responses = submission.raw_responses;
  const allKeys = Object.keys(responses);

  // Build an ordered list: known questions first, then any extra fields
  const knownIds = new Set(questions.map((q) => q.question_id));
  const extraKeys = allKeys.filter((k) => !knownIds.has(k));

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Metadata row */}
      <div className="flex flex-wrap gap-6 text-xs">
        <div>
          <span className="text-surface-400 block mb-0.5">Submission ID</span>
          <span className="font-mono text-surface-700">{submission.id}</span>
        </div>
        <div>
          <span className="text-surface-400 block mb-0.5">Schema ID</span>
          <span className="font-mono text-surface-700">{submission.survey_schema_id}</span>
        </div>
        <div>
          <span className="text-surface-400 block mb-0.5">Received</span>
          <span className="text-surface-700">{formatDate(submission.received_at)}</span>
        </div>
        <div>
          <span className="text-surface-400 block mb-0.5">Format</span>
          <span className="badge-info">{submission.source_format}</span>
        </div>
        <div>
          <span className="text-surface-400 block mb-0.5">Valid</span>
          {submission.is_valid ? (
            <span className="text-emerald-600 font-medium">Yes</span>
          ) : (
            <span className="text-red-500 font-medium">No</span>
          )}
        </div>
      </div>

      {/* Quality scores */}
      {score && (
        <div>
          <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
            Quality Scores
          </h4>
          <div className="flex flex-wrap gap-4">
            <ScoreBar label="Composite" value={score.composite_score} color="bg-brand-500" />
            <ScoreBar label="Speed" value={score.speed_score} color="bg-blue-500" />
            <ScoreBar label="Variance" value={score.variance_score} color="bg-emerald-500" />
            <ScoreBar label="Gibberish" value={score.gibberish_score} color="bg-amber-500" />
            <div className="flex items-center">
              <span className={cn(gradeBadgeClass(score.grade), "text-xs")}>{score.grade}</span>
            </div>
          </div>
        </div>
      )}

      {/* Full response data */}
      <div>
        <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
          All Responses
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {questions.map((q) => (
            <ResponseField
              key={q.question_id}
              label={q.text}
              questionId={q.question_id}
              dataType={q.data_type}
              value={responses[q.question_id]}
            />
          ))}
          {extraKeys.map((key) => (
            <ResponseField
              key={key}
              label={key}
              questionId={key}
              dataType="UNKNOWN"
              value={responses[key]}
            />
          ))}
        </div>
      </div>

      {/* Raw JSON */}
      <details className="text-xs">
        <summary className="cursor-pointer text-surface-400 hover:text-surface-600 transition-colors">
          View raw JSON
        </summary>
        <pre className="mt-2 bg-surface-900 text-surface-100 rounded-lg p-4 overflow-x-auto font-mono text-xs leading-relaxed">
          {JSON.stringify(responses, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ── Score progress bar ───────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-surface-500 w-20">{label}</span>
      <div className="w-24 h-2 rounded-full bg-surface-200">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-surface-600 w-10">{value.toFixed(2)}</span>
    </div>
  );
}

// ── Individual response field card ───────────

function ResponseField({
  label,
  questionId,
  dataType,
  value,
}: {
  label: string;
  questionId: string;
  dataType: string;
  value: unknown;
}) {
  const displayValue = value === null || value === undefined ? "—" : String(value);
  const isLong = displayValue.length > 80;

  return (
    <div className="bg-white rounded-lg border border-surface-100 p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs font-medium text-surface-700 leading-tight">{label}</span>
        <span className="text-[10px] font-mono text-surface-400 shrink-0">{dataType}</span>
      </div>
      <p
        className={cn(
          "text-sm text-surface-800",
          isLong ? "line-clamp-3 hover:line-clamp-none cursor-pointer transition-all" : ""
        )}
        title={displayValue}
      >
        {displayValue}
      </p>
    </div>
  );
}