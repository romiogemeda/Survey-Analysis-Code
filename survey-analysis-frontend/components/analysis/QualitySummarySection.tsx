"use client";

import React from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  ArrowRight
} from 'lucide-react';
import { QualitySummary } from '@/types';
import { cn, gradeBadgeClass } from '@/lib/utils';
import Link from 'next/link';

interface QualitySummarySectionProps {
  summary: QualitySummary;
}

/**
 * QualitySummarySection Component
 * Displays high-level data quality metrics including pass rates, grade breakdowns,
 * and identified quality issues (for low-grade responses).
 */
export default function QualitySummarySection({ summary }: QualitySummarySectionProps) {
  // Unscored state: shown when no submissions have been processed by the quality module
  if (!summary.scored) {
    return (
      <section className="space-y-4 pt-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 animate-pulse">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-surface-900">Response Quality</h2>
            <p className="text-sm text-surface-500">Analysis of the reliability and integrity of survey data</p>
          </div>
        </div>

        <div className="card-padded bg-surface-50/50 border-dashed flex flex-col items-center py-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center shadow-sm border border-surface-100 mb-5">
            <Info size={32} className="text-surface-300" />
          </div>
          <p className="text-surface-600 max-w-md mb-8 font-medium leading-relaxed">
            {summary.message || 'No quality scores are currently available for this survey schema.'}
          </p>
          {/* External navigation to processing module */}
          <Link 
            href="/analysis?tab=responses" 
            className="group flex items-center gap-2.5 px-6 py-3 bg-white border border-surface-200 rounded-2xl text-sm font-bold text-surface-700 hover:text-brand-600 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-50 transition-all duration-300"
          >
            Run quality scoring from the Responses tab to see this analysis
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    );
  }

  // Scored state: full distribution of quality metrics
  const passRate = summary.pass_rate || 0;
  const passRatePercent = Math.round(passRate * 100);
  
  const getPassColorClass = () => {
    if (passRate >= 0.7) return 'text-emerald-600';
    if (passRate >= 0.4) return 'text-amber-600';
    return 'text-red-500';
  };

  const getPassBgClass = () => {
    if (passRate >= 0.7) return 'bg-emerald-500';
    if (passRate >= 0.4) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <section className="space-y-6 pt-10">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h2 className="text-xl font-display font-black text-surface-900">Response Quality</h2>
          <p className="text-sm text-surface-500 font-medium">Statistical reliability and data integrity assessment</p>
        </div>
      </div>

      <div className="grid gap-6 animate-slide-up">
        {/* Main Pass Rate Summary Card */}
        <div className="card-padded overflow-hidden relative border-l-4 border-l-brand-600 bg-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 py-2">
            <div className="relative z-10">
              <div className={cn("text-6xl font-display font-black tracking-tighter mb-2", getPassColorClass())}>
                {passRatePercent}% <span className="text-3xl font-bold -ml-1">Passed</span>
              </div>
              <p className="text-base text-surface-500 font-bold">
                {summary.passed_count} <span className="font-normal opacity-70">of</span> {summary.total_scored} <span className="font-normal opacity-70">processed responses met the quality threshold.</span>
              </p>
            </div>
            <div className="hidden lg:block">
              <div className={cn("w-20 h-20 rounded-full flex items-center justify-center bg-surface-50", getPassColorClass())}>
                <CheckCircle2 size={40} className="opacity-40" />
              </div>
            </div>
          </div>
          
          {/* Pass Rate Progress Indicator */}
          <div className="mt-8 w-full h-3 bg-surface-100 rounded-full overflow-hidden">
            <div 
              className={cn("h-full transition-all duration-[1.5s] ease-out rounded-full", getPassBgClass())}
              style={{ width: `${passRatePercent}%` }}
            />
          </div>
        </div>

        {/* Detailed Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GRADE BREAKDOWN */}
          <div className="card-padded bg-white">
            <h3 className="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] mb-6">Grade Breakdown</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 p-5 rounded-3xl bg-emerald-50/40 border border-emerald-100/50 flex flex-col items-center hover:bg-emerald-50 transition-colors">
                <span className={cn(gradeBadgeClass('HIGH'), "mb-3 font-black px-3")}>HIGH</span>
                <span className="text-3xl font-display font-black text-emerald-700">{summary.grade_breakdown?.HIGH || 0}</span>
              </div>
              <div className="flex-1 p-5 rounded-3xl bg-amber-50/40 border border-amber-100/50 flex flex-col items-center hover:bg-amber-50 transition-colors">
                <span className={cn(gradeBadgeClass('MEDIUM'), "mb-3 font-black px-3")}>MEDIUM</span>
                <span className="text-3xl font-display font-black text-amber-700">{summary.grade_breakdown?.MEDIUM || 0}</span>
              </div>
              <div className="flex-1 p-5 rounded-3xl bg-red-50/40 border border-red-100/50 flex flex-col items-center hover:bg-red-50 transition-colors">
                <span className={cn(gradeBadgeClass('LOW'), "mb-3 font-black px-3")}>LOW</span>
                <span className="text-3xl font-display font-black text-red-700">{summary.grade_breakdown?.LOW || 0}</span>
              </div>
            </div>
          </div>

          {/* TOP QUALITATIVE ISSUES (Conditional) */}
          {summary.top_issues && summary.top_issues.length > 0 ? (
            <div className="card-padded bg-surface-900 text-white overflow-hidden">
              <h3 className="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] mb-5">Main Quality Issues</h3>
              <ul className="space-y-4">
                {summary.top_issues.slice(0, 3).map((issue, idx) => (
                  <li key={idx} className="flex items-center gap-4 group">
                    <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center text-red-400 group-hover:bg-red-400 group-hover:text-white transition-all duration-300">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1 flex justify-between items-center">
                      <span className="text-sm font-bold text-surface-50">{issue.issue}</span>
                      <span className="text-[10px] font-black px-2.5 py-1.5 bg-surface-800 rounded-lg text-surface-300 border border-surface-700 tracking-wider">
                        {issue.count} RESPONSES
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="absolute -bottom-6 -right-6 opacity-5 rotate-12">
                <ShieldAlert size={120} />
              </div>
            </div>
          ) : (
             <div className="card-padded bg-surface-50 border-dashed flex flex-col items-center justify-center text-center">
               <CheckCircle2 size={32} className="text-emerald-500 mb-3" />
               <p className="text-sm font-bold text-surface-800">Perfect Integrity</p>
               <p className="text-xs text-surface-500 mt-1">No significant quality issues detected in low-grade responses.</p>
             </div>
          )}
        </div>
      </div>

      {/* Meta Statistics Footnote */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-surface-100">
        <p className="text-[10px] text-surface-400 font-bold uppercase tracking-[0.2em] flex items-center gap-3">
          Average quality score: <span className="text-surface-950 font-black">{(summary.avg_composite_score || 0).toFixed(2)} / 1.00</span>
        </p>
        <p className="text-[10px] text-surface-400 font-bold uppercase tracking-[0.2em] bg-surface-50 px-3 py-1.5 rounded-full">
          Quality Vectors: Speed (30%) · Variance (40%) · Gibberish (30%)
        </p>
      </div>
    </section>
  );
}
