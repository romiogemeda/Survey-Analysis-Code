"use client";

import { useEffect, useState } from "react";
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
} from "recharts";

const COLORS = [
  "#4c6ef5", "#37b24d", "#f59f00", "#f03e3e", "#7950f2",
  "#1c7ed6", "#e64980", "#0ca678", "#fd7e14", "#845ef7",
];

function SurveyChart({ chart }: { chart: ChartPayload }) {
  const data = chart.labels.map((label, i) => ({
    name: label,
    value: chart.values[i] || 0,
  }));

  return (
    <div className="card-padded animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-display font-semibold text-surface-800">
            {chart.question_text || chart.question_id}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge-info text-[10px]">{chart.data_type}</span>
            <span className="text-xs text-surface-400">{chart.chart_type}</span>
          </div>
        </div>
      </div>

      <div className="h-[260px]">
        {(chart.chart_type === "BAR" || chart.chart_type === "HISTOGRAM") && (
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
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e9ecef",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {chart.chart_type === "PIE" && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
                labelLine={{ stroke: "#ced4da" }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e9ecef",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {chart.chart_type === "WORD_CLOUD" && (
          <div className="h-full flex flex-col justify-center">
            <div className="flex flex-wrap gap-2 justify-center p-4">
              {data.map((d, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-transform hover:scale-105"
                  style={{
                    backgroundColor: `${COLORS[i % COLORS.length]}15`,
                    color: COLORS[i % COLORS.length],
                    fontSize: `${Math.max(12, Math.min(24, 12 + d.value * 3))}px`,
                  }}
                >
                  {d.name}: {d.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChartsTab() {
  const { activeSurvey, addToast } = useAppStore();
  const [charts, setCharts] = useState<ChartPayload[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDashboard = async () => {
    if (!activeSurvey) return;
    setLoading(true);
    try {
      const data = await visualization.buildDashboard(activeSurvey.id);
      setCharts(data);
    } catch {
      addToast("Failed to build dashboard", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDashboard();
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
            Auto-generated charts based on question data types
          </p>
        </div>
        <button onClick={loadDashboard} disabled={loading} className="btn-secondary">
          {loading ? "Loading..." : "Refresh Charts"}
        </button>
      </div>

      {charts.length === 0 && !loading ? (
        <div className="card-padded text-center py-12">
          <p className="text-surface-500">
            No chart data available. Upload submissions first, then refresh.
          </p>
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