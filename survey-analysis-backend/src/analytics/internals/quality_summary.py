import logging
from uuid import UUID
from collections import Counter
from src.shared_kernel import QualityGrade
from src.quality.interfaces.api import QualityService

logger = logging.getLogger(__name__)

async def generate_quality_summary(
    survey_schema_id: UUID,
    db_session,
) -> dict:
    """
    Generate a summary of quality scores for all submissions of a survey schema.
    
    Uses QualityService to fetch scores and computes high-level statistics, 
    grade breakdown, and top quality issues identified in low-grade responses.
    """
    service = QualityService(db_session)
    
    try:
        # Fetch scores via the public interface (added requirement)
        scores = await service.get_scores_for_schema(survey_schema_id)
        
        if not scores:
            return {
                'scored': False,
                'message': 'No quality scores available. Run quality scoring from the Responses tab first.'
            }

        total_scored = len(scores)
        
        # grade_breakdown computation
        grades = [s.grade for s in scores]
        grade_counts = Counter(grades)
        
        high_count = grade_counts.get(QualityGrade.HIGH, 0)
        medium_count = grade_counts.get(QualityGrade.MEDIUM, 0)
        low_count = grade_counts.get(QualityGrade.LOW, 0)
        
        passed_count = high_count + medium_count
        failed_count = low_count
        pass_rate = round(passed_count / total_scored, 2) if total_scored > 0 else 0.0
        
        # Calculate average composite score
        total_composite = sum(s.composite_score for s in scores)
        avg_composite = round(total_composite / total_scored, 2) if total_scored > 0 else 0.0
        
        # top_issues logic for LOW-grade submissions
        # For each LOW submission, find the primary reason (lowest component score)
        low_scores = [s for s in scores if s.grade == QualityGrade.LOW]
        top_issues_list = []
        
        if low_scores:
            issues_found = []
            for s in low_scores:
                try:
                    # Map component scores to human-readable issue names
                    score_map = {
                        'Speed issues': s.speed_score,
                        'Low variance': s.variance_score,
                        'Gibberish detected': s.gibberish_score
                    }
                    # Identify the lowest score among the quality metrics
                    lowest_issue = min(score_map, key=score_map.get)
                    issues_found.append(lowest_issue)
                except Exception as e:
                    logger.warning(f"Error determining primary issue for submission {s.submission_id}: {e}")
                    continue
            
            # Aggregate and take top 3 issues
            issue_counts = Counter(issues_found)
            top_issues_list = [
                {'issue': issue, 'count': count}
                for issue, count in issue_counts.most_common(3)
            ]

        return {
            'scored': True,
            'total_scored': total_scored,
            'passed_count': passed_count,
            'failed_count': failed_count,
            'pass_rate': pass_rate,
            'grade_breakdown': {
                'HIGH': high_count,
                'MEDIUM': medium_count,
                'LOW': low_count,
            },
            'avg_composite_score': avg_composite,
            'top_issues': top_issues_list
        }

    except Exception as e:
        logger.error(f"Failed to generate quality summary for schema {survey_schema_id}: {e}", exc_info=True)
        return {
            'scored': False,
            'message': f"An error occurred while generating quality summary: {str(e)}"
        }
