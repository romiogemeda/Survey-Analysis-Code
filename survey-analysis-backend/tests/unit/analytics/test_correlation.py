import pytest
from src.analytics.internals.correlation_engine import CorrelationEngine


@pytest.fixture
def engine():
    return CorrelationEngine()


class TestCorrelationEngine:
    def test_pearson_correlated(self, engine):
        x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        y = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
        result = engine.analyze_pair(x, y, "INTERVAL", "INTERVAL")
        assert result["method"] == "PEARSON"
        assert result["is_significant"] is True
        assert result["statistic_value"] > 0.99

    def test_chi_square_nominal(self, engine):
        x = ["A", "A", "B", "B", "A", "A", "B", "B", "A", "B"]
        y = ["X", "X", "Y", "Y", "X", "X", "Y", "Y", "X", "Y"]
        result = engine.analyze_pair(x, y, "NOMINAL", "NOMINAL")
        assert result["method"] == "CHI_SQUARE"
        assert "p_value" in result

    def test_insufficient_data(self, engine):
        result = engine.analyze_pair([1, 2], [3, 4], "INTERVAL", "INTERVAL")
        assert result["is_significant"] is False
        assert result["method"] is None