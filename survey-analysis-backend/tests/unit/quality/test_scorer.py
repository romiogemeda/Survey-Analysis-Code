"""Unit Tests — Quality Scorer. Tests module in complete isolation."""

import pytest
from src.quality.internals.scorer import QualityScorer
from src.shared_kernel import QualityGrade


@pytest.fixture
def scorer():
    return QualityScorer()


class TestQualityScorer:
    def test_high_quality(self, scorer):
        responses = {"q1": "Strongly Agree", "q2": "Neutral", "q3": "Disagree",
                     "q4": "Agree", "q5": "This product helps my daily workflow significantly."}
        result = scorer.score_submission(responses, completion_time_seconds=120)
        assert result["grade"] == QualityGrade.HIGH
        assert result["composite_score"] >= 0.7

    def test_straight_lined(self, scorer):
        responses = {f"q{i}": "Agree" for i in range(10)}
        result = scorer.score_submission(responses, completion_time_seconds=15)
        assert result["variance_score"] < 0.3

    def test_gibberish_detected(self, scorer):
        responses = {"q1": "OK", "q2": "asdfghjkl asdfghjkl asdfghjkl asdfghjkl"}
        result = scorer.score_submission(responses, completion_time_seconds=60)
        assert result["gibberish_score"] < 0.7

    def test_too_fast(self, scorer):
        responses = {"q1": "Agree", "q2": "Disagree"}
        result = scorer.score_submission(responses, completion_time_seconds=5)
        assert result["speed_score"] < 0.3

    def test_unknown_time(self, scorer):
        responses = {"q1": "Agree"}
        result = scorer.score_submission(responses, completion_time_seconds=None)
        assert result["speed_score"] == 0.7

    def test_output_shape(self, scorer):
        result = scorer.score_submission({"q1": "Test"})
        expected = {"speed_score", "variance_score", "gibberish_score", "composite_score", "grade"}
        assert set(result.keys()) == expected
        assert 0.0 <= result["composite_score"] <= 1.0
