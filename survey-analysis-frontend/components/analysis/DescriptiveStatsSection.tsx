"use client";

import React, { useState } from 'react';
import { 
  ChevronDown, 
  BarChart3, 
  AlertCircle, 
  Hash, 
  Type, 
  CheckSquare, 
  ListOrdered,
  Layers,
  Calendar,
  Fingerprint,
  Info
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { DescriptiveStat } from '@/types';
import { cn } from '@/lib/utils';

interface DescriptiveStatsSectionProps {
  stats: DescriptiveStat[];
}

const TYPE_COLORS: Record<string, string> = {
  INTERVAL: 'bg-blue-100 text-blue-700',
  OPEN_ENDED: 'bg-purple-100 text-purple-700',
  ORDINAL: 'bg-amber-100 text-amber-700',
  BOOLEAN: 'bg-teal-100 text-teal-700',
  IDENTIFIER: 'bg-gray-100 text-gray-500',
  DATETIME: 'bg-cyan-100 text-cyan-700',
  MULTI_SELECT: 'bg-indigo-100 text-indigo-700',
  NOMINAL: 'bg-surface-100 text-surface-600',
};

const CHART_COLORS = [
  "#4c6ef5", "#37b24d", "#f59f00", "#f03e3e", "#7950f2",
  "#1c7ed6", "#e64980", "#0ca678", "#fd7e14", "#845ef7",
  "#339af0",
];

const MiniBarChart = ({ distribution }: { distribution: Record<string, number> }) => {
  const data = Object.entries(distribution)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="h-[220px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: -10, right: 30, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f3f5" />
          <XAxis type="number" hide />
          <YAxis 
            dataKey="name" 
            type="category" 
            width={140} 
            tick={{ fontSize: 11, fill: '#495057' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip 
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            contentStyle={{ 
              borderRadius: '8px', 
              border: 'none', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: '12px'
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const MetricItem = ({ label, value }: { label: string, value: any }) => (
  <div className="bg-surface-50 p-3 rounded-lg border border-surface-100">
    <p className="text-[10px] text-surface-400 font-bold uppercase tracking-wider mb-1">{label}</p>
    <p className="text-sm font-bold text-surface-900">{value !== undefined && value !== null ? value : '—'}</p>
  </div>
);

const StatCard = ({ stat }: { stat: DescriptiveStat }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const getMissingRateColor = (rate: number) => {
    if (rate < 0.05) return 'text-emerald-600 bg-emerald-50';
    if (rate <= 0.15) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const renderContent = () => {
    if (stat.error) {
      return (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100">
          <AlertCircle size={16} />
          <span className="text-sm font-medium">Could not compute stats for this question: {stat.error}</span>
        </div>
      );
    }

    const type = stat.data_type;

    if (type === 'IDENTIFIER' || type === 'DATETIME') {
      return (
        <div className="p-4 bg-surface-50 rounded-xl border border-surface-100 flex items-center gap-3">
          <Info size={18} className="text-surface-400 shrink-0" />
          <p className="text-sm text-surface-600 font-medium whitespace-normal">
            {type === 'IDENTIFIER' ? 'Identifier' : 'Datetime'} fields are primarily unique keys or timestamps and are not aggregated into distributional statistics. 
            Found <span className="text-surface-900 font-bold">{stat.distinct_count}</span> unique records.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Metric Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(type === 'INTERVAL' || type === 'ORDINAL') && stat.mean !== undefined && (
            <>
              <MetricItem label="Mean" value={stat.mean} />
              <MetricItem label="Median" value={stat.median} />
              <MetricItem label="Std Dev" value={stat.std_dev} />
              <MetricItem label="Min" value={stat.min} />
              <MetricItem label="Max" value={stat.max} />
            </>
          )}
          {(type === 'NOMINAL' || type === 'BOOLEAN' || (type === 'ORDINAL' && stat.mode !== undefined)) && (
            <>
              <MetricItem label="Mode" value={stat.mode === "True" ? 'True' : stat.mode === "False" ? 'False' : stat.mode} />
              <MetricItem label="Mode Count" value={stat.mode_count} />
            </>
          )}
          {type === 'OPEN_ENDED' && (
            <>
              <MetricItem label="Avg Words" value={stat.avg_word_count} />
              <MetricItem label="Min Words" value={stat.min_word_count} />
              <MetricItem label="Max Words" value={stat.max_word_count} />
            </>
          )}
          {type === 'MULTI_SELECT' && (
            <>
              <MetricItem label="Avg Selections" value={stat.avg_selections_per_respondent} />
            </>
          )}
          <MetricItem label="Unique Values" value={stat.distinct_count} />
        </div>

        {/* Charts */}
        {stat.distribution && Object.keys(stat.distribution).length > 0 && (
          <div className="pt-6 border-t border-surface-100">
            <h5 className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-3">
              Value Distribution {type === 'NOMINAL' || type === 'MULTI_SELECT' || type === 'ORDINAL' ? '(Top 10 Values)' : ''}
            </h5>
            <MiniBarChart distribution={stat.distribution} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-surface-200 rounded-2xl overflow-hidden transition-all duration-300 hover:border-surface-300 hover:shadow-lg">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-50/50 transition-colors"
      >
        <div className="flex items-center gap-5 text-left">
          <div className="w-11 h-11 shrink-0 bg-surface-50 rounded-xl flex items-center justify-center text-surface-500">
            {stat.data_type === 'INTERVAL' && <Hash size={20} />}
            {stat.data_type === 'NOMINAL' && <Layers size={20} />}
            {stat.data_type === 'BOOLEAN' && <CheckSquare size={20} />}
            {stat.data_type === 'ORDINAL' && <ListOrdered size={20} />}
            {stat.data_type === 'OPEN_ENDED' && <Type size={20} />}
            {stat.data_type === 'IDENTIFIER' && <Fingerprint size={20} />}
            {stat.data_type === 'DATETIME' && <Calendar size={20} />}
            {stat.data_type === 'MULTI_SELECT' && <BarChart3 size={20} />}
          </div>
          <div>
            <h4 className="text-sm font-bold text-surface-900 line-clamp-1">{stat.question_text}</h4>
            <div className="flex items-center gap-3 mt-1.5">
              <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest leading-none flex items-center justify-center", TYPE_COLORS[stat.data_type] || TYPE_COLORS.NOMINAL)}>
                {stat.data_type}
              </span>
              <div className="w-1 h-1 rounded-full bg-surface-300" />
              <span className="text-xs text-surface-500 font-medium">
                {stat.total_responses.toLocaleString()} responses
              </span>
              <div className="w-1 h-1 rounded-full bg-surface-300" />
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", getMissingRateColor(stat.missing_rate))}>
                {Math.round(stat.missing_rate * 100)}% missing
              </span>
            </div>
          </div>
        </div>
        <div className={cn("p-2 rounded-lg transition-colors", isOpen ? "bg-surface-100 text-surface-900" : "text-surface-400 group-hover:bg-surface-50 font-bold")}>
          <ChevronDown 
            size={20} 
            className={cn("transition-transform duration-500 ease-out", isOpen && "rotate-180")} 
          />
        </div>
      </button>

      {isOpen && (
        <div className="p-6 bg-white border-t border-surface-100 animate-slide-up">
          {renderContent()}
        </div>
      )}
    </div>
  );
};

export default function DescriptiveStatsSection({ stats }: DescriptiveStatsSectionProps) {
  return (
    <section className="space-y-6 pt-10">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-100">
          <BarChart3 size={24} />
        </div>
        <div>
          <h2 className="text-xl font-display font-black text-surface-900">Question Breakdown</h2>
          <p className="text-sm text-surface-500 font-medium">Response statistics and distribution profiles for each survey question</p>
        </div>
      </div>

      {!stats || stats.length === 0 ? (
        <div className="p-16 text-center bg-surface-50 rounded-[2rem] border-2 border-dashed border-surface-200 animate-pulse">
          <p className="text-surface-400 text-sm font-semibold tracking-wide uppercase">No questions available to analyze.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {stats.map((stat) => (
            <StatCard key={stat.question_id} stat={stat} />
          ))}
        </div>
      )}
    </section>
  );
}
