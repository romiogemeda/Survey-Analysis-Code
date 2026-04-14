"use client";

import { useEffect, useState, useRef } from "react";
import { toPng } from "html-to-image";
import { useAppStore } from "@/lib/store";
import { visualization } from "@/lib/api";
import type { ChartPayload } from "@/types";
import {
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
  ComposedChart,
  Line,
  ReferenceLine,
} from "recharts";

const COLORS = [
  "#4c6ef5", "#37b24d", "#f59f00", "#f03e3e", "#7950f2",
  "#1c7ed6", "#e64980", "#0ca678", "#fd7e14", "#845ef7",
  "#339af0",
];

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "#37b24d",
  Neutral: "#868e96",
  Negative: "#f03e3e",
};

// Diverging palette for Likert scale (red → amber → gray → teal → green)
const LIKERT_COLORS = [
  "#f03e3e", "#e8590c", "#f59f00", "#868e96", "#0ca678", "#37b24d", "#2b8a3e",
  "#099268", "#1098ad", "#1c7ed6",
];

// ── Chart Renderers ─────────────────────────────

function DonutChart({ chart }: { chart: ChartPayload }) {
  const data = chart.labels.map((label, i) => ({
    name: label,
    value: chart.values[i] || 0,
  }));
  const isSentiment = chart.chart_type === "SENTIMENT_DONUT";
  const isPercent = isSentiment;

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
            label={({ name, value }) =>
              `${name} (${isPercent ? `${value}%` : value})`
            }
            labelLine={{ stroke: "#ced4da" }}
          >
            {data.map((entry, i) =>
              isSentiment ? (
                <Cell key={i} fill={SENTIMENT_COLORS[entry.name] || COLORS[i % COLORS.length]} />
              ) : (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              )
            )}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e9ecef", fontSize: "12px" }}
            formatter={(value: number) => [isPercent ? `${value}%` : value, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      {isSentiment && chart.metadata?.avg_polarity !== undefined && (
        <p className="text-center text-xs text-surface-500 -mt-2">
          Average polarity: {chart.metadata.avg_polarity}
        </p>
      )}
    </div>
  );
}

function HorizontalBarChart({ chart }: { chart: ChartPayload }) {
  const data = chart.labels.map((label, i) => ({
    name: label,
    value: chart.values[i] || 0,
  }));

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "#868e96" }}
            tickLine={false}
            axisLine={{ stroke: "#dee2e6" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#868e96" }}
            tickLine={false}
            axisLine={false}
            width={100}
          />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e9ecef", fontSize: "12px" }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {chart.metadata?.total_categories && (
        <p className="text-xs text-surface-400 mt-1">
          Showing top {Math.min(10, chart.labels.length)} of {chart.metadata.total_categories} categories
        </p>
      )}
    </div>
  );
}

function VerticalBarChart({ chart }: { chart: ChartPayload }) {
  const data = chart.labels.map((label, i) => ({
    name: label,
    value: chart.values[i] || 0,
  }));

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#868e96" }}
            tickLine={false}
            axisLine={{ stroke: "#dee2e6" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#868e96" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e9ecef", fontSize: "12px" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LikertBarChart({ chart }: { chart: ChartPayload }) {
  const data = chart.labels.map((label, i) => ({
    name: label,
    value: chart.values[i] || 0,
  }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#495057", fontWeight: 500 }}
            tickLine={false}
            axisLine={{ stroke: "#dee2e6" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#868e96" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e9ecef", fontSize: "12px" }}
            formatter={(value: number) => [
              `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
              "Responses",
            ]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => {
              const colorIdx = Math.round((i / Math.max(1, data.length - 1)) * (LIKERT_COLORS.length - 1));
              return <Cell key={i} fill={LIKERT_COLORS[colorIdx]} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {chart.metadata?.scale_min !== undefined && (
        <p className="text-xs text-surface-400 mt-1">
          Likert scale: {chart.metadata.scale_min} – {chart.metadata.scale_max}
        </p>
      )}
    </div>
  );
}

function HistogramChart({ chart }: { chart: ChartPayload }) {
  const data = chart.labels.map((label, i) => ({
    name: label,
    value: chart.values[i] || 0,
  }));
  const stats = chart.metadata as Record<string, number> | undefined;

  return (
    <div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#868e96" }}
              tickLine={false}
              axisLine={{ stroke: "#dee2e6" }}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#868e96" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", border: "1px solid #e9ecef", fontSize: "12px" }}
            />
            <Bar dataKey="value" fill="#4c6ef5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {stats && stats.mean !== undefined && (
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-surface-500">
          <span>Mean: <strong className="text-surface-700">{stats.mean}</strong></span>
          <span>Median: <strong className="text-surface-700">{stats.median}</strong></span>
          <span>Std Dev: <strong className="text-surface-700">{stats.std_dev}</strong></span>
          <span>Min: <strong className="text-surface-700">{stats.min}</strong></span>
          <span>Max: <strong className="text-surface-700">{stats.max}</strong></span>
          <span>n = {stats.count}</span>
        </div>
      )}
    </div>
  );
}

function BoxPlotChart({ chart }: { chart: ChartPayload }) {
  // values = [min, Q1, median, Q3, max]
  const [min, q1, median, q3, max] = chart.values;
  const stats = chart.metadata as Record<string, number> | undefined;

  const data = [
    { name: "", min, q1, median, q3, max, iqr_low: q1, iqr_high: q3 },
  ];

  return (
    <div>
      <div className="flex items-center justify-center h-[220px]">
        <div className="w-full max-w-sm">
          {/* Visual box plot using divs */}
          <div className="relative h-8 mx-8">
            {/* Whisker line */}
            <div
              className="absolute top-1/2 h-0.5 bg-surface-400 -translate-y-1/2"
              style={{
                left: `${((min - min) / (max - min)) * 100}%`,
                right: `${100 - ((max - min) / (max - min)) * 100}%`,
              }}
            />
            {/* Box */}
            <div
              className="absolute top-0 bottom-0 bg-brand-100 border-2 border-brand-500 rounded"
              style={{
                left: `${((q1 - min) / (max - min)) * 100}%`,
                width: `${((q3 - q1) / (max - min)) * 100}%`,
              }}
            />
            {/* Median line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-brand-700"
              style={{ left: `${((median - min) / (max - min)) * 100}%` }}
            />
            {/* Min whisker cap */}
            <div className="absolute top-1 bottom-1 w-0.5 bg-surface-400" style={{ left: "0%" }} />
            {/* Max whisker cap */}
            <div className="absolute top-1 bottom-1 w-0.5 bg-surface-400" style={{ left: "100%" }} />
          </div>
          {/* Labels */}
          <div className="relative h-6 mx-8 mt-1">
            <span className="absolute text-[10px] text-surface-500 -translate-x-1/2" style={{ left: "0%" }}>{min}</span>
            <span className="absolute text-[10px] text-surface-500 -translate-x-1/2" style={{ left: `${((q1 - min) / (max - min)) * 100}%` }}>{q1}</span>
            <span className="absolute text-[10px] font-semibold text-brand-700 -translate-x-1/2" style={{ left: `${((median - min) / (max - min)) * 100}%` }}>{median}</span>
            <span className="absolute text-[10px] text-surface-500 -translate-x-1/2" style={{ left: `${((q3 - min) / (max - min)) * 100}%` }}>{q3}</span>
            <span className="absolute text-[10px] text-surface-500 -translate-x-1/2" style={{ left: "100%" }}>{max}</span>
          </div>
          {/* Legend */}
          <div className="flex justify-center gap-4 mt-4 text-[10px] text-surface-400">
            <span>Min</span><span>Q1</span>
            <span className="font-semibold text-brand-600">Median</span>
            <span>Q3</span><span>Max</span>
          </div>
        </div>
      </div>
      {stats && stats.mean !== undefined && (
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-surface-500">
          <span>Mean: <strong className="text-surface-700">{stats.mean}</strong></span>
          <span>Std Dev: <strong className="text-surface-700">{stats.std_dev}</strong></span>
          <span>n = {stats.count}</span>
        </div>
      )}
    </div>
  );
}

// ── Chart Wrapper ────────────────────────────────

function SurveyChart({ chart }: { chart: ChartPayload }) {
  const chartTypeLabel: Record<string, string> = {
    DONUT: "Donut",
    H_BAR: "Horizontal Bar",
    BAR: "Bar",
    LIKERT_BAR: "Likert Scale",
    HISTOGRAM: "Histogram",
    BOX_PLOT: "Box Plot",
    SENTIMENT_DONUT: "Sentiment",
    WORD_FREQ_BAR: "Word Frequency",
  };

  const chartRef = useRef<HTMLDivElement>(null);
  const { addToast } = useAppStore();

  const handleExport = async () => {
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, { backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      a.href = dataUrl;
      const sanitizedId = chart.question_id.replace(/[^a-z0-9_-]/gi, "_");
      a.download = `${sanitizedId}_chart.png`;
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      addToast("Failed to export chart", "error");
    }
  };

  return (
    <div ref={chartRef} className="card-padded animate-slide-up">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-sm font-display font-semibold text-surface-800">
            {chart.question_text || chart.question_id}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge-info text-[10px]">{chart.data_type}</span>
            <span className="text-xs text-surface-400">
              {chartTypeLabel[chart.chart_type] || chart.chart_type}
            </span>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="ml-4 p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors flex-shrink-0"
          title="Export as PNG"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      </div>

      {(chart.chart_type === "DONUT" || chart.chart_type === "SENTIMENT_DONUT") && (
        <DonutChart chart={chart} />
      )}

      {chart.chart_type === "H_BAR" && <HorizontalBarChart chart={chart} />}

      {chart.chart_type === "WORD_FREQ_BAR" && <HorizontalBarChart chart={chart} />}

      {chart.chart_type === "BAR" && <VerticalBarChart chart={chart} />}

      {chart.chart_type === "LIKERT_BAR" && <LikertBarChart chart={chart} />}

      {chart.chart_type === "HISTOGRAM" && <HistogramChart chart={chart} />}

      {chart.chart_type === "BOX_PLOT" && <BoxPlotChart chart={chart} />}

      {chart.data_type === "MULTI_SELECT" && chart.metadata?.total_respondents && (
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-surface-500">
          <span>{chart.metadata.total_respondents} respondents</span>
          <span>{chart.metadata.unique_options} unique options</span>
          <span>Avg {chart.metadata.avg_selections_per_respondent} selections each</span>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────

export default function ChartsTab() {
  const { activeSurvey, addToast } = useAppStore();
  const [charts, setCharts] = useState<ChartPayload[]>([]);
  const [simulatedCharts, setSimulatedCharts] = useState<ChartPayload[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadDashboard = async (comparing: boolean = isComparing) => {
    if (!activeSurvey) return;
    setLoading(true);
    try {
      if (comparing) {
        const [real, sim] = await Promise.all([
          visualization.buildDashboard(activeSurvey.id, "real"),
          visualization.buildDashboard(activeSurvey.id, "simulated")
        ]);

        if (sim.length === 0) {
          addToast("No simulated data available. Generate some in the Simulation tab.", "info");
          setIsComparing(false);
          const all = await visualization.buildDashboard(activeSurvey.id, "all");
          setCharts(all);
          setSimulatedCharts([]);
        } else {
          setCharts(real);
          setSimulatedCharts(sim);
        }
      } else {
        const data = await visualization.buildDashboard(activeSurvey.id, "all");
        setCharts(data);
        setSimulatedCharts([]);
      }
    } catch {
      addToast("Failed to build dashboard", "error");
    }
    setLoading(false);
  };

  const handleToggleCompare = (checked: boolean) => {
    setIsComparing(checked);
    loadDashboard(checked);
  };

  useEffect(() => {
    loadDashboard(isComparing);
  }, [activeSurvey]);

  if (!activeSurvey) {
    return (
      <div className="card-padded text-center py-16 animate-fade-in">
        <p className="text-surface-500">Select a survey to view charts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Charts & Visualization</h1>
          <p className="text-surface-500 text-sm mt-1">
            Auto-generated charts based on question data types — IDENTIFIER and DATETIME columns are skipped
          </p>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isComparing} 
              onChange={(e) => handleToggleCompare(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-surface-700">Compare Real vs Simulated</span>
          </label>
          <button onClick={() => loadDashboard(isComparing)} disabled={loading} className="btn-secondary">
            {loading ? "Loading..." : "Refresh Charts"}
          </button>
        </div>
      </div>

      {charts.length === 0 && !loading ? (
        <div className="card-padded text-center py-12">
          <p className="text-surface-500">
            No chart data available. Upload submissions first, then refresh.
          </p>
        </div>
      ) : isComparing ? (
        <div className="space-y-8">
          {charts.map((realChart) => {
            const simChart = simulatedCharts.find((c) => c.question_id === realChart.question_id);
            return (
              <div key={realChart.question_id} className="grid grid-cols-2 gap-5 border border-surface-200 rounded-xl p-4 bg-surface-50 shadow-sm">
                <div className="space-y-3">
                  <div className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md border border-brand-200 bg-brand-50 text-brand-700">
                    Real Data
                  </div>
                  <SurveyChart chart={realChart} />
                </div>
                <div className="space-y-3">
                  <div className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md border border-purple-200 bg-purple-50 text-purple-700">
                    Simulated Data
                  </div>
                  {simChart ? (
                    <SurveyChart chart={simChart} />
                  ) : (
                    <div className="h-[260px] flex items-center justify-center border border-dashed border-surface-300 rounded-xl bg-white">
                      <span className="text-surface-400 text-sm">No data available</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {charts.map((chart) => (
            <SurveyChart key={chart.question_id} chart={chart} />
          ))}
        </div>
      )}
    </div>
  );
}