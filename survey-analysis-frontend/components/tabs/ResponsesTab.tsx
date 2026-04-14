"use client";

import { Fragment, useMemo, useState, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { Submission, QualityScore, QuestionDefinition } from "@/types";
import { cn, formatDate, gradeBadgeClass } from "@/lib/utils";

type SortField = "received_at" | "source_format" | "is_valid" | "grade" | "composite";
type SortDir = "asc" | "desc";
const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ResponsesTab() {
  const { activeSurvey, submissions, qualityScores } = useAppStore();

  const [sortField, setSortField] = useState<SortField>("received_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterText, setFilterText] = useState("");
  const [filterValid, setFilterValid] = useState<"all" | "valid" | "invalid">("all");
  const [filterGrade, setFilterGrade] = useState<"all" | "HIGH" | "MEDIUM" | "LOW">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setIsExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const exportAsJSON = () => {
    const data = filtered.map((sub) => {
      const score = qualityScores.get(sub.id);
      return {
        id: sub.id,
        received_at: sub.received_at,
        is_valid: sub.is_valid,
        raw_responses: sub.raw_responses,
        ...(score ? { quality: score } : {})
      };
    });

    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const title = activeSurvey?.title || "survey";
    const sanitizedTitle = title.replace(/[^a-z0-9_-]/gi, "_");
    link.download = `${sanitizedTitle}_responses.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportOpen(false);
  };

  function escapeCsv(value: unknown): string {
    if (value === null || value === undefined) return '';
    let str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\n\r]/.test(str)) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const exportAsCSV = () => {
    if (!filtered.length) return;

    const headers = [
      "id",
      "received_at",
      "is_valid",
      ...questions.map(q => q.question_id),
      "quality_grade",
      "composite_score",
      "speed_score",
      "variance_score",
      "gibberish_score"
    ];

    let csvStr = headers.map(escapeCsv).join(",") + "\r\n";

    filtered.forEach((sub) => {
      const score = qualityScores.get(sub.id);
      const row = [
        sub.id,
        sub.received_at,
        sub.is_valid,
        ...questions.map(q => sub.raw_responses[q.question_id]),
        score?.grade,
        score?.composite_score,
        score?.speed_score,
        score?.variance_score,
        score?.gibberish_score
      ];
      csvStr += row.map(escapeCsv).join(",") + "\r\n";
    });

    const bom = '\ufeff';
    const blob = new Blob([bom + csvStr], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const title = activeSurvey?.title || "survey";
    const sanitizedTitle = title.replace(/[^a-z0-9_-]/gi, "_");
    link.download = `${sanitizedTitle}_responses.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportOpen(false);
  };

  const questions: QuestionDefinition[] = activeSurvey?.question_definitions ?? [];

  const filtered = useMemo(() => {
    let rows = [...submissions];
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
  }, [submissions, filterValid, filterGrade, filterText, qualityScores]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortField === "received_at") cmp = new Date(a.received_at).getTime() - new Date(b.received_at).getTime();
      else if (sortField === "source_format") cmp = a.source_format.localeCompare(b.source_format);
      else if (sortField === "is_valid") cmp = Number(a.is_valid) - Number(b.is_valid);
      else if (sortField === "grade") {
        const order = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        cmp = (order[qualityScores.get(a.id)?.grade as keyof typeof order] ?? 0) - (order[qualityScores.get(b.id)?.grade as keyof typeof order] ?? 0);
      } else if (sortField === "composite") {
        cmp = (qualityScores.get(a.id)?.composite_score ?? 0) - (qualityScores.get(b.id)?.composite_score ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortField, sortDir, qualityScores]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-surface-300 ml-1">↕</span>;
    return <span className="text-brand-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  if (!activeSurvey) {
    return <div className="card-padded text-center py-16"><p className="text-surface-500">Select a survey to view responses.</p></div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="card-padded">
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" value={filterText} onChange={(e) => { setFilterText(e.target.value); setPage(1); }} placeholder="Search responses..." className="input flex-1 min-w-[200px]" />
          <select value={filterValid} onChange={(e) => { setFilterValid(e.target.value as typeof filterValid); setPage(1); }} className="input w-auto">
            <option value="all">All validity</option>
            <option value="valid">Valid only</option>
            <option value="invalid">Invalid only</option>
          </select>
          <select value={filterGrade} onChange={(e) => { setFilterGrade(e.target.value as typeof filterGrade); setPage(1); }} className="input w-auto">
            <option value="all">All grades</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="input w-auto">
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <span className="text-xs text-surface-500 whitespace-nowrap">{filtered.length} of {submissions.length}</span>
          
          <div className="relative ml-auto" ref={exportRef}>
            <button 
              onClick={() => setIsExportOpen(!isExportOpen)} 
              className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-2"
            >
              Export
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-surface-200 rounded-md shadow-lg z-10 py-1">
                <button
                  onClick={exportAsCSV}
                  className="w-full text-left px-4 py-2 text-sm text-surface-700 hover:bg-surface-50 transition-colors"
                >
                  Export as CSV
                </button>
                <button
                  onClick={exportAsJSON}
                  className="w-full text-left px-4 py-2 text-sm text-surface-700 hover:bg-surface-50 transition-colors"
                >
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
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
                  <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => toggleSort("received_at")}>Received <SortIcon field="received_at" /></th>
                  <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => toggleSort("is_valid")}>Valid <SortIcon field="is_valid" /></th>
                  <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => toggleSort("grade")}>Grade <SortIcon field="grade" /></th>
                  <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => toggleSort("composite")}>Score <SortIcon field="composite" /></th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {questions.slice(0, 3).map((q) => (
                    <th key={q.question_id} className="px-4 py-3 font-medium max-w-[140px] truncate" title={q.text}>{q.text}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {paginated.map((sub) => {
                  const score = qualityScores.get(sub.id);
                  const isExpanded = expandedId === sub.id;
                  return (
                    <Fragment key={sub.id}>
                      <tr className={cn("hover:bg-surface-50 transition-colors cursor-pointer", isExpanded && "bg-brand-50/40")} onClick={() => setExpandedId(isExpanded ? null : sub.id)}>
                        <td className="px-4 py-2.5 text-surface-400">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("transition-transform duration-200", isExpanded && "rotate-90")}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-surface-500">{sub.id.slice(0, 8)}…</td>
                        <td className="px-4 py-2.5 text-xs text-surface-600">{formatDate(sub.received_at)}</td>
                        <td className="px-4 py-2.5">
                          {sub.is_valid ? <span className="text-emerald-600 text-xs font-medium">✓</span> : <span className="text-red-500 text-xs font-medium">✗</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {score ? <span className={gradeBadgeClass(score.grade)}>{score.grade}</span> : <span className="text-xs text-surface-400">—</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{score ? score.composite_score.toFixed(3) : "—"}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {sub.completed_at ? <span className="text-emerald-600">Completed</span> : sub.started_at ? <span className="text-amber-500">Abandoned</span> : <span className="text-surface-400">—</span>}
                        </td>
                        {questions.slice(0, 3).map((q) => (
                          <td key={q.question_id} className="px-4 py-2.5 text-xs max-w-[140px] truncate">{String(sub.raw_responses[q.question_id] ?? "—")}</td>
                        ))}
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={100} className="bg-surface-50/70 border-b border-surface-200">
                            <div className="px-6 py-5 space-y-5">
                              <div className="flex flex-wrap gap-6 text-xs">
                                <div><span className="text-surface-400 block mb-0.5">ID</span><span className="font-mono text-surface-700">{sub.id}</span></div>
                                <div><span className="text-surface-400 block mb-0.5">Started</span><span className="text-surface-700">{sub.started_at ? formatDate(sub.started_at) : "—"}</span></div>
                                <div><span className="text-surface-400 block mb-0.5">Completed</span><span className="text-surface-700">{sub.completed_at ? formatDate(sub.completed_at) : "—"}</span></div>
                                <div><span className="text-surface-400 block mb-0.5">Format</span><span className="badge-info">{sub.source_format}</span></div>
                              </div>
                              {score && (
                                <div className="flex flex-wrap gap-4">
                                  {[{l:"Composite",v:score.composite_score,c:"bg-brand-500"},{l:"Speed",v:score.speed_score,c:"bg-blue-500"},{l:"Variance",v:score.variance_score,c:"bg-emerald-500"},{l:"Gibberish",v:score.gibberish_score,c:"bg-amber-500"}].map(({l,v,c}) => (
                                    <div key={l} className="flex items-center gap-2">
                                      <span className="text-xs text-surface-500 w-20">{l}</span>
                                      <div className="w-24 h-2 rounded-full bg-surface-200"><div className={cn("h-full rounded-full", c)} style={{width:`${Math.min(100,v*100)}%`}} /></div>
                                      <span className="text-xs font-mono text-surface-600 w-10">{v.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {questions.map((q) => (
                                  <div key={q.question_id} className="bg-white rounded-lg border border-surface-100 p-3">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                      <span className="text-xs font-medium text-surface-700">{q.text}</span>
                                      <span className="text-[10px] font-mono text-surface-400">{q.data_type}</span>
                                    </div>
                                    <p className="text-sm text-surface-800">{String(sub.raw_responses[q.question_id] ?? "—")}</p>
                                  </div>
                                ))}
                              </div>
                              <details className="text-xs">
                                <summary className="cursor-pointer text-surface-400 hover:text-surface-600">Raw JSON</summary>
                                <pre className="mt-2 bg-surface-900 text-surface-100 rounded-lg p-4 overflow-x-auto font-mono text-xs">{JSON.stringify(sub.raw_responses, null, 2)}</pre>
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100 bg-surface-50/30">
            <span className="text-xs text-surface-500">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn-ghost text-xs px-2 py-1 disabled:opacity-30">First</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost text-xs px-2 py-1 disabled:opacity-30">← Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pn: number;
                if (totalPages <= 5) pn = i + 1;
                else if (page <= 3) pn = i + 1;
                else if (page >= totalPages - 2) pn = totalPages - 4 + i;
                else pn = page - 2 + i;
                return <button key={pn} onClick={() => setPage(pn)} className={cn("text-xs px-2.5 py-1 rounded", page === pn ? "bg-brand-600 text-white" : "btn-ghost")}>{pn}</button>;
              })}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost text-xs px-2 py-1 disabled:opacity-30">Next →</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn-ghost text-xs px-2 py-1 disabled:opacity-30">Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}