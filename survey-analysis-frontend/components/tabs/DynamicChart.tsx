"use client";

import React, { useMemo, useState } from "react";
import * as Babel from "@babel/standalone";
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

const RECHARTS_SCOPE: Record<string, unknown> = {
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

// ── Code Cleaning ───────────────────────────────

function cleanLLMCode(raw: string): string {
  let code = raw.trim();

  // Strip markdown code fences: ```jsx ... ``` or ```javascript ... ```
  code = code.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "");
  code = code.trim();

  // Strip leading "export default" if present
  code = code.replace(/^export\s+default\s+/, "");

  // Strip trailing semicolons (Babel adds these)
  code = code.replace(/;\s*$/, "");

  return code.trim();
}

// ── Transpile & Compile ─────────────────────────

function compileChartCode(rawCode: string): Function | null {
  /**
   * Key insight: We wrap the LLM code into a full function body
   * BEFORE transpiling with Babel. This way Babel produces valid
   * JS statements (with semicolons in proper positions), and we
   * never have to deal with semicolons inside return() expressions.
   *
   * LLM outputs:  ({ data }) => { return <BarChart>...</BarChart> }
   * We wrap:       var __c = ({ data }) => { return <BarChart>...</BarChart> }; return __c;
   * Babel outputs: var __c = ({ data }) => { return React.createElement(BarChart, ...); }; return __c;
   * new Function:  executes normally — semicolons are in statement context
   */
  const cleaned = cleanLLMCode(rawCode);

  // Build a function body that assigns the component and returns it
  const wrappedJSX = `var __c = ${cleaned};\nreturn __c;`;

  // Transpile the ENTIRE wrapped body — Babel handles JSX→createElement
  // and all semicolons end up in valid statement positions
  const transpiled = Babel.transform(wrappedJSX, {
    presets: ["react"],
    sourceType: "script",
    parserOpts: {
      allowReturnOutsideFunction: true,
    },
  });

  if (!transpiled.code) {
    return null;
  }

  // Build the executable function with Recharts components in scope
  const scopeKeys = Object.keys(RECHARTS_SCOPE);
  const scopeValues = Object.values(RECHARTS_SCOPE);

  const factory = new Function(...scopeKeys, transpiled.code);
  const component = factory(...scopeValues);

  if (typeof component !== "function") {
    return null;
  }

  return component;
}

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
      const component = compileChartCode(code);
      if (!component) {
        setRenderError("Generated code did not produce a valid component.");
        return null;
      }
      return component;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to compile chart code.";
      console.error("[DynamicChart] Compilation error:", message);
      console.error("[DynamicChart] Raw code:", code);
      setRenderError(message);
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