"""Quality — Internal Scoring Engine. FR-04: Quality scoring based on Speed, Variance, Gibberish."""

import re
from collections import Counter
from src.shared_kernel import QualityGrade


class QualityScorer:
    MIN_COMPLETION_SECONDS = 30
    STRAIGHT_LINE_THRESHOLD = 0.85

    def score_submission(
        self, raw_responses: dict, completion_time_seconds: float | None = None
    ) -> dict:
        speed = self._score_speed(completion_time_seconds)
        variance = self._score_variance(raw_responses)
        gibberish = self._score_gibberish(raw_responses)
        composite = (speed * 0.3) + (variance * 0.4) + (gibberish * 0.3)
        grade = self._composite_to_grade(composite)
        return {
            "speed_score": round(speed, 3),
            "variance_score": round(variance, 3),
            "gibberish_score": round(gibberish, 3),
            "composite_score": round(composite, 3),
            "grade": grade,
        }

    def _score_speed(self, seconds: float | None) -> float:
        if seconds is None:
            return 0.7
        if seconds < self.MIN_COMPLETION_SECONDS:
            return max(0.1, seconds / self.MIN_COMPLETION_SECONDS)
        return min(1.0, 0.7 + (seconds / 600) * 0.3)

    def _score_variance(self, responses: dict) -> float:
        values = [str(v) for v in responses.values() if v is not None]
        if len(values) <= 1:
            return 0.5
        counts = Counter(values)
        most_common_ratio = counts.most_common(1)[0][1] / len(values)
        if most_common_ratio >= self.STRAIGHT_LINE_THRESHOLD:
            return 0.1
        return round(1.0 - (most_common_ratio * 0.5), 3)

    def _score_gibberish(self, responses: dict) -> float:
        text_fields = [str(v) for v in responses.values() if isinstance(v, str) and len(str(v)) > 20]
        if not text_fields:
            return 0.8
        bad = sum(1 for t in text_fields if self._is_gibberish(t))
        if bad == 0:
            return 1.0
        return max(0.1, 1.0 - (bad / len(text_fields)))

    def _is_gibberish(self, text: str) -> bool:
        if re.search(r"(.)\1{4,}", text):
            return True
        words = text.lower().split()
        if len(words) > 3 and len(set(words)) / len(words) < 0.3:
            return True
        alpha_ratio = sum(1 for c in text if c.isalpha()) / max(len(text), 1)
        return alpha_ratio < 0.4

    def _composite_to_grade(self, composite: float) -> QualityGrade:
        if composite >= 0.7:
            return QualityGrade.HIGH
        if composite >= 0.4:
            return QualityGrade.MEDIUM
        return QualityGrade.LOW