import pandas as pd
import numpy as np
import logging
import re
from src.shared_kernel.domain_types import DataType

logger = logging.getLogger(__name__)

def generate_descriptive_stats(
    submissions: list[dict],
    question_definitions: list,
) -> list[dict]:
    """
    Generate descriptive statistics for survey submissions across different data types.
    
    For each question in question_definitions, compute stats based on the question's data_type.
    Wraps each question's computation in a try/except to ensure one failure doesn't halt the process.
    """
    if not question_definitions:
        return []

    # Convert submissions to DataFrame for easier manipulation
    # We assume 'submissions' is a list of flat dicts corresponding to question responses
    df = pd.DataFrame(submissions)
    results = []

    for q in question_definitions:
        # question_definitions might be objects (like Pydantic models) or dicts
        q_id = getattr(q, 'question_id', None) or q.get('question_id')
        q_text = getattr(q, 'text', None) or q.get('text')
        # data_type might be the Enum member or a string
        raw_type = getattr(q, 'data_type', None) or q.get('data_type')
        
        # Normalize q_type to DataType enum if possible
        try:
            if isinstance(raw_type, str):
                q_type = DataType(raw_type)
            else:
                q_type = raw_type
        except ValueError:
            q_type = raw_type

        try:
            # Base stats applicable to all types
            if q_id not in df.columns:
                series = pd.Series([None] * len(submissions))
            else:
                series = df[q_id]

            # total_responses: non-null, non-empty
            valid_responses = series.replace('', np.nan).dropna()
            total_responses = int(len(valid_responses))
            missing_count = int(len(series) - total_responses)
            missing_rate = round(float(missing_count / len(series)), 4) if len(series) > 0 else 0.0
            distinct_count = int(valid_responses.nunique())

            stats = {
                "question_id": q_id,
                "question_text": q_text,
                "data_type": str(raw_type),
                "total_responses": total_responses,
                "missing_count": missing_count,
                "missing_rate": missing_rate,
                "distinct_count": distinct_count,
            }

            # Handle identifiers and datetimes early (base fields only)
            if q_type in [DataType.IDENTIFIER, DataType.DATETIME]:
                results.append(stats)
                continue

            if q_type == DataType.INTERVAL:
                # mean, median, std_dev, min, max — all rounded to 2 decimal places
                nums = pd.to_numeric(valid_responses, errors='coerce').dropna()
                if not nums.empty:
                    stats.update({
                        "mean": round(float(nums.mean()), 2),
                        "median": round(float(nums.median()), 2),
                        "std_dev": round(float(nums.std()), 2) if len(nums) > 1 else 0.0,
                        "min": round(float(nums.min()), 2),
                        "max": round(float(nums.max()), 2),
                    })
                else:
                    stats.update({"mean": 0.0, "median": 0.0, "std_dev": 0.0, "min": 0.0, "max": 0.0})

            elif q_type == DataType.ORDINAL:
                # Same as INTERVAL if values parse as numeric; otherwise same as NOMINAL
                nums = pd.to_numeric(valid_responses, errors='coerce').dropna()
                dist_counts = valid_responses.value_counts()
                
                if not nums.empty and len(nums) == len(valid_responses):
                    stats.update({
                        "mean": round(float(nums.mean()), 2),
                        "median": round(float(nums.median()), 2),
                        "std_dev": round(float(nums.std()), 2) if len(nums) > 1 else 0.0,
                        "min": round(float(nums.min()), 2),
                        "max": round(float(nums.max()), 2),
                    })
                else:
                    if not dist_counts.empty:
                        stats["mode"] = str(dist_counts.index[0])
                        stats["mode_count"] = int(dist_counts.iloc[0])
                
                # Include a distribution dict mapping each distinct value → count
                stats["distribution"] = {str(k): int(v) for k, v in dist_counts.to_dict().items()}

            elif q_type in [DataType.NOMINAL, DataType.BOOLEAN]:
                # mode: most common, mode_count: occurrences, distribution: top 10 sorted descending
                dist_counts = valid_responses.value_counts()
                if not dist_counts.empty:
                    stats["mode"] = str(dist_counts.index[0])
                    stats["mode_count"] = int(dist_counts.iloc[0])
                    top_dist = dist_counts.head(10).to_dict()
                    stats["distribution"] = {str(k): int(v) for k, v in top_dist.items()}
                else:
                    stats["mode"] = None
                    stats["mode_count"] = 0
                    stats["distribution"] = {}

            elif q_type == DataType.OPEN_ENDED:
                # avg_word_count (rounded to 1), min, max
                word_counts = valid_responses.astype(str).str.split().str.len()
                if not word_counts.empty:
                    stats.update({
                        "avg_word_count": round(float(word_counts.mean()), 1),
                        "min_word_count": int(word_counts.min()),
                        "max_word_count": int(word_counts.max()),
                    })
                else:
                    stats.update({"avg_word_count": 0.0, "min_word_count": 0, "max_word_count": 0})

            elif q_type == DataType.MULTI_SELECT:
                # Split on commas/semicolons, count individual selections
                all_selections = []
                selection_counts_per_resp = []
                for val in valid_responses.astype(str):
                    selections = [s.strip() for s in re.split(r'[,;]', val) if s.strip()]
                    all_selections.extend(selections)
                    selection_counts_per_resp.append(len(selections))
                
                if all_selections:
                    dist_all = pd.Series(all_selections).value_counts().to_dict()
                    stats["distribution"] = {str(k): int(v) for k, v in dist_all.items()}
                    stats["avg_selections_per_respondent"] = round(float(np.mean(selection_counts_per_resp)), 1)
                else:
                    stats["distribution"] = {}
                    stats["avg_selections_per_respondent"] = 0.0

            results.append(stats)

        except Exception as e:
            logger.warning(f"Error computing stats for question {q_id}: {e}")
            results.append({
                "question_id": q_id,
                "question_text": q_text,
                "data_type": str(raw_type),
                "error": str(e)
            })

    return results
