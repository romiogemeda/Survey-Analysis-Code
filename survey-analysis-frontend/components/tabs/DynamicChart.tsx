"use client";

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  AreaChart,
  Area,
  ComposedChart,
  ReferenceLine,
  Label,
  Treemap,
  FunnelChart,
  Funnel,
  LabelList,
  RadialBarChart,
  RadialBar,
} from "recharts";

// ── Error Boundary ──────────────────────────────

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            <p className="font-medium">Chart failed to render</p>
            <p className="mt-1 text-xs text-red-400">{this.state.error}</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ── Scope of Recharts components available to LLM-generated code ──

const RECHARTS_SCOPE = {
  React,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  AreaChart,
  Area,
  ComposedChart,
  ReferenceLine,
  Label,
  Treemap,
  FunnelChart,
  Funnel,
  LabelList,
  RadialBarChart,
  RadialBar,
};

// ── Dynamic Chart Renderer ──────────────────────

interface DynamicChartProps {
  code: string;
  data: Record<string, unknown>[];
  chartType?: string;
}

export default function DynamicChart({ code, data, chartType }: DynamicChartProps) {
  const [renderError, setRenderError] = useState<string | null>(null);

  const ChartComponent = useMemo(() => {
    try {
      // Build a function that has all Recharts components in scope
      const scopeKeys = Object.keys(RECHARTS_SCOPE);
      const scopeValues = Object.values(RECHARTS_SCOPE);

      // The code should be an arrow function: ({ data }) => { ... }
      // We wrap it so that `new Function` returns the component
      const factory = new Function(
        ...scopeKeys,
        `"use strict"; return (${code});`
      );

      const component = factory(...scopeValues);

      if (typeof component !== "function") {
        setRenderError("Generated code did not produce a function.");
        return null;
      }

      return component;
    } catch (err) {
      setRenderError(
        err instanceof Error ? err.message : "Failed to compile chart code."
      );
      return null;
    }
  }, [code]);

  if (renderError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-medium text-amber-700">Could not render chart</p>
        <p className="mt-1 text-xs text-amber-500">{renderError}</p>
      </div>
    );
  }

  if (!ChartComponent) {
    return null;
  }

  return (
    <div className="mt-3">
      {chartType && (
        <div className="mb-2">
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-600 border border-brand-200">
            {chartType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
        </div>
      )}
      <div className="rounded-xl border border-surface-200 bg-white p-4">
        <ChartErrorBoundary>
          <ChartComponent data={data} />
        </ChartErrorBoundary>
      </div>
    </div>
  );
}