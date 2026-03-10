"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { quality } from "@/lib/api";
import type { QualityBatchResult } from "@/types";
import { cn, formatDate, gradeBadgeClass } from "@/lib/utils";

export default function QualityTab() {
  const { activeSurvey, addToast, submissions, qualityScores, setQualityScores } = useAppStore();
  const scores = qualityScores;
  const [batchResult, setBatchResult] = useState<QualityBatchResult | null>(null);
  const [scoring, setScoring] = useState(false);

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
    } catch (e) {
      addToast("Scoring failed", "error");
    }
    setScoring(false);
  };

  const gradeStats = {
    HIGH: Array.from((scores || new Map()).values()).filter((s) => s.grade === "HIGH").length,
    MEDIUM: Array.from((scores || new Map()).values()).filter((s) => s.grade === "MEDIUM").length,
    LOW: Array.from((scores || new Map()).values()).filter((s) => s.grade === "LOW").length,
  };
  const total = gradeStats.HIGH + gradeStats.MEDIUM + gradeStats.LOW;

  if (!activeSurvey) {
    return (
      <div className="card-padded text-center py-16 animate-fade-in">
        <p className="text-surface-500">Select a survey to view quality scores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Quality Scoring</h1>
          <p className="text-surface-500 text-sm mt-1">
            Evaluate submission quality — speed, variance, and gibberish detection
          </p>
        </div>
        <button
          onClick={handleScoreBatch}
          disabled={scoring || submissions.length === 0}
          className="btn-primary"
        >
          {scoring ? "Scoring..." : "Score All Submissions"}
        </button>
      </div>

      {/* Grade Distribution */}
      {total > 0 && (
        <div className="card-padded">
          <h3 className="section-heading mb-4">Grade Distribution</h3>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="h-4 rounded-full overflow-hidden flex bg-surface-100">
                {gradeStats.HIGH > 0 && (
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(gradeStats.HIGH / total) * 100}%` }}
                  />
                )}
                {gradeStats.MEDIUM > 0 && (
                  <div
                    className="bg-amber-400 transition-all duration-500"
                    style={{ width: `${(gradeStats.MEDIUM / total) * 100}%` }}
                  />
                )}
                {gradeStats.LOW > 0 && (
                  <div
                    className="bg-red-400 transition-all duration-500"
                    style={{ width: `${(gradeStats.LOW / total) * 100}%` }}
                  />
                )}
              </div>
            </div>
            <div className="flex gap-5 text-sm">
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                High: {gradeStats.HIGH}
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-amber-400" />
                Medium: {gradeStats.MEDIUM}
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-red-400" />
                Low: {gradeStats.LOW}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="card-padded">
        <h3 className="section-heading mb-4">
          Submissions ({submissions.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-100">
                <th className="pb-3 pr-4">ID</th>
                <th className="pb-3 pr-4">Grade</th>
                <th className="pb-3 pr-4">Composite</th>
                <th className="pb-3 pr-4">Speed</th>
                <th className="pb-3 pr-4">Variance</th>
                <th className="pb-3 pr-4">Gibberish</th>
                <th className="pb-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {submissions.map((sub) => {
                const score = scores.get(sub.id);
                return (
                  <tr key={sub.id} className="hover:bg-surface-50 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-surface-500">
                      {sub.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 pr-4">
                      {score ? (
                        <span className={gradeBadgeClass(score.grade)}>
                          {score.grade}
                        </span>
                      ) : (
                        <span className="text-xs text-surface-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {score ? score.composite_score.toFixed(3) : "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      {score && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-surface-100">
                            <div
                              className="h-full rounded-full bg-brand-500 transition-all"
                              style={{ width: `${score.speed_score * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-surface-500">
                            {score.speed_score.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {score && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-surface-100">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${score.variance_score * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-surface-500">
                            {score.variance_score.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {score && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-surface-100">
                            <div
                              className="h-full rounded-full bg-amber-500 transition-all"
                              style={{ width: `${score.gibberish_score * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-surface-500">
                            {score.gibberish_score.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-xs text-surface-500">
                      {formatDate(sub.received_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}