import os
import asyncio
from litellm import acompletion
from dotenv import load_dotenv

async def test_key(model, key):
    print(f"Testing Gemini model: {model}")
    try:
        response = await acompletion(
            model=model,
            messages=[{"role": "user", "content": "Say hello!"}],
            api_key=key
        )
        print(f"SUCCESS with {model}!")
        return True
    except Exception as e:
        print(f"FAILED {model}: {e}")
        return False

async def main():
    load_dotenv()
    google_key = os.getenv("GOOGLE_API_KEY")
    if not google_key or "AIza" not in google_key:
        print("No valid Google key found")
        return

    models = [
        "gemini/gemini-1.5-flash",
        "gemini/gemini-1.0-pro",
        "gemini/gemini-1.5-pro",
    ]
    
    for m in models:
        if await test_key(m, google_key):
            break

if __name__ == "__main__":
    asyncio.run(main())
