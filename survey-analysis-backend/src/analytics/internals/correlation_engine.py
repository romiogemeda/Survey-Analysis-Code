"""Analytics — Internal Correlation Engine. FR-06: Cross-variable correlation."""

import logging
import numpy as np
from scipy import stats
from src.shared_kernel import CorrelationMethod

logger = logging.getLogger(__name__)
SIGNIFICANCE_LEVEL = 0.05


class CorrelationEngine:
    """Performs statistical correlation analysis between survey variables."""

    def analyze_pair(
        self, x_values: list, y_values: list, x_type: str, y_type: str
    ) -> dict:
        if len(x_values) != len(y_values) or len(x_values) < 3:
            return self._no_result("Insufficient data")

        method = self._select_method(x_type, y_type)
        try:
            if method == CorrelationMethod.CHI_SQUARE:
                return self._chi_square(x_values, y_values)
            elif method == CorrelationMethod.PEARSON:
                return self._pearson(x_values, y_values)
            else:
                return self._spearman(x_values, y_values)
        except Exception as e:
            logger.warning("Correlation analysis error: %s", e)
            return self._no_result(str(e))

    def _select_method(self, x_type: str, y_type: str) -> CorrelationMethod:
        nominal = {"NOMINAL", "OPEN_ENDED"}
        if x_type in nominal or y_type in nominal:
            return CorrelationMethod.CHI_SQUARE
        if x_type == "INTERVAL" and y_type == "INTERVAL":
            return CorrelationMethod.PEARSON
        return CorrelationMethod.SPEARMAN

    def _chi_square(self, x: list, y: list) -> dict:
        import pandas as pd
        contingency = pd.crosstab(pd.Series(x, name="x"), pd.Series(y, name="y"))
        chi2, p_value, dof, expected = stats.chi2_contingency(contingency)
        return {
            "method": CorrelationMethod.CHI_SQUARE,
            "statistic_value": round(float(chi2), 4),
            "p_value": round(float(p_value), 6),
            "is_significant": p_value < SIGNIFICANCE_LEVEL,
        }

    def _pearson(self, x: list, y: list) -> dict:
        r, p = stats.pearsonr(np.array(x, dtype=float), np.array(y, dtype=float))
        return {
            "method": CorrelationMethod.PEARSON,
            "statistic_value": round(float(r), 4),
            "p_value": round(float(p), 6),
            "is_significant": p < SIGNIFICANCE_LEVEL,
        }

    def _spearman(self, x: list, y: list) -> dict:
        r, p = stats.spearmanr(np.array(x, dtype=float), np.array(y, dtype=float))
        return {
            "method": CorrelationMethod.SPEARMAN,
            "statistic_value": round(float(r), 4),
            "p_value": round(float(p), 6),
            "is_significant": p < SIGNIFICANCE_LEVEL,
        }

    def _no_result(self, reason: str) -> dict:
        return {
            "method": None, "statistic_value": 0.0,
            "p_value": 1.0, "is_significant": False, "error": reason,
        }