"""Unit Tests — Ingestion Parser."""

import io
import pytest
from unittest.mock import AsyncMock
from src.ingestion.internals.parser import _parse_json, _parse_csv


class TestParser:
    def test_parse_json_array(self):
        data = '[{"q1": "A"}, {"q1": "B"}]'
        result = _parse_json(data)
        assert len(result) == 2
        assert result[0]["q1"] == "A"

    def test_parse_json_single_object(self):
        data = '{"q1": "A", "q2": "B"}'
        result = _parse_json(data)
        assert len(result) == 1

    def test_parse_csv(self):
        csv_data = "q1,q2,q3\nA,B,C\nD,E,F"
        result = _parse_csv(csv_data)
        assert len(result) == 2
        assert result[0]["q1"] == "A"
        assert result[1]["q3"] == "F"

    def test_parse_json_invalid(self):
        with pytest.raises(ValueError):
            _parse_json('"just a string"')