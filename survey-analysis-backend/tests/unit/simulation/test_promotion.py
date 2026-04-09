import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from src.shared_kernel import SubmissionRecord

@pytest.mark.asyncio
async def test_flag_preservation_on_promotion():
    """
    Test that the promotion service constructs a dictionary with
    _is_simulated: True and passes it cleanly into IngestionService.
    """
    from src.simulation.interfaces.api import promote_responses
    
    schema_id = uuid4()
    mock_session = AsyncMock()
    
    # Simulate a fake response object that SimulationService would return
    fake_simulated_response = {
        "id": "sim-123",
        "persona_id": str(uuid4()),
        "synthetic_answers": {"q1": "test_answer_123"},
        "is_simulated": True,
        "llm_model_used": "mock-model"
    }
    
    # We patch where they are IMPORTED/USED inside simulation.interfaces.api
    # Since they are imported inside the function, we can patch the source or the module namespace
    with patch("src.simulation.interfaces.api.SimulationService") as MockSimService, \
         patch("src.ingestion.interfaces.api.IngestionService") as MockIngService:
         
        mock_sim = MockSimService.return_value
        mock_sim.get_simulated_responses = AsyncMock(return_value=[fake_simulated_response])
        
        mock_ing = MockIngService.return_value
        mock_ing.save_submission = AsyncMock()
        
        # Call the promotion endpoint logic
        result = await promote_responses(schema_id, mock_session)
        
        assert result["promoted"] == 1
        
        # Verify call arguments
        mock_ing.save_submission.assert_called_once()
        args, kwargs = mock_ing.save_submission.call_args
        saved_submission = args[0]
        
        # Verify flag preservation
        assert isinstance(saved_submission, SubmissionRecord)
        assert saved_submission.raw_responses.get("_is_simulated") is True
        assert saved_submission.raw_responses.get("q1") == "test_answer_123"
