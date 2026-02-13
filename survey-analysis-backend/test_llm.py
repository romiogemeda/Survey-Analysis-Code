"""
Test script to verify LLM API configuration is working.
This will test the chat assistant endpoint directly.
"""
import asyncio
import sys
sys.path.insert(0, 'src')

# Load environment variables first
from dotenv import load_dotenv
load_dotenv()

# Clear settings cache to ensure fresh values
from config.settings import get_settings
get_settings.cache_clear()

from src.shared_kernel.llm_gateway import llm_gateway, LLMRequest

async def test_llm():
    print("Testing LLM Gateway with OpenRouter API...")
    print("=" * 50)
    
    try:
        request = LLMRequest(
            system_prompt="You are a helpful assistant.",
            user_prompt="Say 'Hello! The API key is working!' in one sentence.",
        )
        
        print("Sending test request to LLM...")
        response = await llm_gateway.complete(request)
        
        print("\n✅ SUCCESS!")
        print(f"Model used: {response.model_used}")
        print(f"Response: {response.content}")
        print(f"Tokens used: {response.total_tokens}")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_llm())
