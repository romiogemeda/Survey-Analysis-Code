import asyncio
import sys
import httpx
from uuid import UUID

sys.path.insert(0, 'src')

# Load environment variables first
from dotenv import load_dotenv
load_dotenv()

from src.ingestion.models.orm import SurveySchemaModel
from src.shared_kernel import get_db_session
from sqlalchemy import select

from src.chat_assistant.interfaces.api import ChatAssistantService, StartSessionRequest
import traceback

async def reproduce():
    print("Fetching survey schema...")
    
    # We need a session context for the whole operation
    async for db_session in get_db_session():
        try:
            # 1. Get Schema
            result = await db_session.execute(select(SurveySchemaModel))
            schema = result.scalars().first()
            if not schema:
                print("No survey schema found in DB.")
                return
            
            print(f"Found schema ID: {schema.id}")

            # 2. Service Logic
            service = ChatAssistantService(db_session)
            
            # Start Session
            print("Starting session...")
            start_req = StartSessionRequest(survey_schema_id=schema.id, session_type="DATA_QUERY")
            session_result = await service.start_session(start_req)
            session_id = UUID(session_result["session_id"])
            print(f"Session started: {session_id}")
            
            # Send Message
            print("Sending message...")
            response = await service.send_message(session_id, "Hello")
            print("Success!")
            print(response)
            
        except Exception:
            print("\nCAUGHT EXCEPTION:")
            traceback.print_exc()
        
        # Break after one attempt (since get_db_session yields infinite or until closed, but here we just want one session)
        break

if __name__ == "__main__":
    asyncio.run(reproduce())
