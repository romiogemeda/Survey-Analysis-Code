"""
Chat Assistant — Query Executor.
Executes structured query specs against in-memory submission data.
Supports: count, sum, mean, median, min, max, distinct, distribution, group_by.
Filter ops: eq, ne, gt, lt, gte, lte, in, not_in, contains.
No arbitrary code execution — only predefined operations.
"""

import logging
import re
from collections import Counter
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


VALID_OPS = {"eq", "ne", "gt", "lt", "gte", "lte", "in", "not_in", "contains"}
VALID_AGGS = {"count", "sum", "mean", "median", "min", "max", "distinct", "distribution"}


class QueryExecutor:
    """Execute structured query specs against a pandas DataFrame."""

    def __init__(self, data: list[dict]) -> None:
        self._df = pd.DataFrame(data)

    @property
    def dataframe(self) -> pd.DataFrame:
        return self._df

    def execute(self, spec: dict) -> dict:
        """
        Execute a query spec and return results + a human-readable summary.

        Expected spec shape:
        {
            "operation": "count" | "sum" | "mean" | "median" | "min" | "max" | "distinct" | "distribution",
            "column": "<column_name>" | null,       # target column for aggregation
            "filters": [
                {"column": "<col>", "op": "eq|ne|gt|lt|gte|lte|in|not_in|contains", "value": <val>}
            ],
            "group_by": "<column_name>" | null
        }
        """
        if self._df.empty:
            return {"summary": "No data available.", "data": {}, "count": 0}

        try:
            df = self._apply_filters(self._df.copy(), spec.get("filters", []))
            operation = spec.get("operation", "count")
            column = spec.get("column")
            group_by = spec.get("group_by")

            if operation not in VALID_AGGS:
                return {"summary": f"Unknown operation: {operation}", "data": {}, "count": len(df)}

            if group_by and group_by in df.columns:
                return self._execute_grouped(df, operation, column, group_by)
            else:
                return self._execute_simple(df, operation, column)

        except Exception as e:
            logger.error("Query execution error: %s", e)
            return {"summary": f"Query failed: {str(e)}", "data": {}, "count": 0}

    def _apply_filters(self, df: pd.DataFrame, filters: list[dict]) -> pd.DataFrame:
        for f in filters:
            col = f.get("column", "")
            op = f.get("op", "eq")
            value = f.get("value")

            if col not in df.columns:
                logger.warning("Filter column '%s' not found, skipping", col)
                continue

            if op not in VALID_OPS:
                logger.warning("Invalid filter op '%s', skipping", op)
                continue

            series = df[col]

            if op == "eq":
                df = df[series.astype(str).str.lower() == str(value).lower()]
            elif op == "ne":
                df = df[series.astype(str).str.lower() != str(value).lower()]
            elif op == "contains":
                df = df[series.astype(str).str.lower().str.contains(str(value).lower(), na=False)]
            elif op == "in":
                vals = [str(v).lower() for v in value] if isinstance(value, list) else [str(value).lower()]
                df = df[series.astype(str).str.lower().isin(vals)]
            elif op == "not_in":
                vals = [str(v).lower() for v in value] if isinstance(value, list) else [str(value).lower()]
                df = df[~series.astype(str).str.lower().isin(vals)]
            elif op in ("gt", "lt", "gte", "lte"):
                numeric_series = pd.to_numeric(series, errors="coerce")
                numeric_value = float(value)
                if op == "gt":
                    df = df[numeric_series > numeric_value]
                elif op == "lt":
                    df = df[numeric_series < numeric_value]
                elif op == "gte":
                    df = df[numeric_series >= numeric_value]
                elif op == "lte":
                    df = df[numeric_series <= numeric_value]

        return df

    def _execute_simple(self, df: pd.DataFrame, operation: str, column: str | None) -> dict:
        n = len(df)

        if operation == "count":
            if column and column in df.columns:
                count = df[column].notna().sum()
                summary = f"Count of non-null '{column}': {count} (out of {n} filtered rows)"
                return {"summary": summary, "data": {"count": int(count)}, "count": n}
            summary = f"Found {n} matching rows."
            return {"summary": summary, "data": {"count": n}, "count": n}

        if not column or column not in df.columns:
            return {"summary": f"Column required for '{operation}'.", "data": {}, "count": n}

        if operation == "distinct":
            uniques = df[column].dropna().unique().tolist()
            summary = f"'{column}' has {len(uniques)} distinct values: {', '.join(str(u) for u in uniques[:20])}"
            return {"summary": summary, "data": {"distinct": uniques, "count": len(uniques)}, "count": n}

        if operation == "distribution":
            dist = df[column].astype(str).value_counts().to_dict()
            sorted_dist = dict(sorted(dist.items(), key=lambda x: x[1], reverse=True))
            top_items = list(sorted_dist.items())[:5]
            summary = f"Distribution of '{column}': " + ", ".join(f"{k}: {v}" for k, v in top_items)
            if len(sorted_dist) > 5:
                summary += f" ... ({len(sorted_dist)} total categories)"
            return {"summary": summary, "data": {"distribution": sorted_dist}, "count": n}

        # Numeric aggregations
        numeric = pd.to_numeric(df[column], errors="coerce").dropna()
        if numeric.empty:
            return {"summary": f"No numeric values in '{column}'.", "data": {}, "count": n}

        if operation == "sum":
            val = round(float(numeric.sum()), 2)
            summary = f"Sum of '{column}': {val} (n={len(numeric)})"
            return {"summary": summary, "data": {"sum": val, "n": len(numeric)}, "count": n}

        if operation == "mean":
            val = round(float(numeric.mean()), 2)
            summary = f"Average '{column}': {val} (n={len(numeric)})"
            return {"summary": summary, "data": {"mean": val, "n": len(numeric)}, "count": n}

        if operation == "median":
            val = round(float(numeric.median()), 2)
            summary = f"Median '{column}': {val} (n={len(numeric)})"
            return {"summary": summary, "data": {"median": val, "n": len(numeric)}, "count": n}

        if operation == "min":
            val = round(float(numeric.min()), 2)
            summary = f"Minimum '{column}': {val}"
            return {"summary": summary, "data": {"min": val}, "count": n}

        if operation == "max":
            val = round(float(numeric.max()), 2)
            summary = f"Maximum '{column}': {val}"
            return {"summary": summary, "data": {"max": val}, "count": n}

        return {"summary": f"Unsupported operation: {operation}", "data": {}, "count": n}

    def _execute_grouped(
        self, df: pd.DataFrame, operation: str, column: str | None, group_by: str
    ) -> dict:
        groups = df.groupby(df[group_by].astype(str))

        if operation == "count":
            if column and column in df.columns:
                result = groups[column].count().to_dict()
            else:
                result = groups.size().to_dict()
            summary = f"Count by '{group_by}': " + ", ".join(f"{k}: {v}" for k, v in result.items())
            return {
                "summary": summary,
                "data": {"grouped": result, "group_by": group_by, "operation": "count"},
                "count": len(df),
            }

        if operation == "distribution":
            result = groups.size().to_dict()
            summary = f"Distribution by '{group_by}': " + ", ".join(f"{k}: {v}" for k, v in result.items())
            return {
                "summary": summary,
                "data": {"grouped": result, "group_by": group_by, "operation": "distribution"},
                "count": len(df),
            }

        if not column or column not in df.columns:
            return {"summary": f"Column required for grouped '{operation}'.", "data": {}, "count": len(df)}

        numeric_df = df.copy()
        numeric_df[column] = pd.to_numeric(numeric_df[column], errors="coerce")

        if operation == "mean":
            result = groups.apply(
                lambda g: round(float(pd.to_numeric(g[column], errors="coerce").mean()), 2)
                if not pd.to_numeric(g[column], errors="coerce").dropna().empty else 0
            ).to_dict()
            summary = f"Average '{column}' by '{group_by}': " + ", ".join(f"{k}: {v}" for k, v in result.items())
        elif operation == "sum":
            result = groups.apply(
                lambda g: round(float(pd.to_numeric(g[column], errors="coerce").sum()), 2)
            ).to_dict()
            summary = f"Sum of '{column}' by '{group_by}': " + ", ".join(f"{k}: {v}" for k, v in result.items())
        elif operation == "median":
            result = groups.apply(
                lambda g: round(float(pd.to_numeric(g[column], errors="coerce").median()), 2)
                if not pd.to_numeric(g[column], errors="coerce").dropna().empty else 0
            ).to_dict()
            summary = f"Median '{column}' by '{group_by}': " + ", ".join(f"{k}: {v}" for k, v in result.items())
        elif operation == "min":
            result = groups.apply(
                lambda g: round(float(pd.to_numeric(g[column], errors="coerce").min()), 2)
                if not pd.to_numeric(g[column], errors="coerce").dropna().empty else 0
            ).to_dict()
            summary = f"Min '{column}' by '{group_by}': " + ", ".join(f"{k}: {v}" for k, v in result.items())
        elif operation == "max":
            result = groups.apply(
                lambda g: round(float(pd.to_numeric(g[column], errors="coerce").max()), 2)
                if not pd.to_numeric(g[column], errors="coerce").dropna().empty else 0
            ).to_dict()
            summary = f"Max '{column}' by '{group_by}': " + ", ".join(f"{k}: {v}" for k, v in result.items())
        else:
            return {"summary": f"Unsupported grouped operation: {operation}", "data": {}, "count": len(df)}

        return {
            "summary": summary,
            "data": {"grouped": result, "group_by": group_by, "operation": operation, "column": column},
            "count": len(df),
        }

    def prepare_chart_data(self, query_result: dict) -> list[dict]:
        """
        Convert query executor results into a flat list of dicts
        suitable for Recharts data prop.
        """
        data_payload = query_result.get("data", {})

        # Grouped results → [{group_by_value, value}, ...]
        if "grouped" in data_payload:
            grouped = data_payload["grouped"]
            group_key = data_payload.get("group_by", "category")
            return [
                {"name": str(k), "value": v}
                for k, v in grouped.items()
            ]

        # Distribution → [{name, value}, ...]
        if "distribution" in data_payload:
            return [
                {"name": str(k), "value": v}
                for k, v in data_payload["distribution"].items()
            ]

        # Single value → [{name, value}]
        for key in ("count", "sum", "mean", "median", "min", "max"):
            if key in data_payload:
                return [{"name": key.capitalize(), "value": data_payload[key]}]

        return []