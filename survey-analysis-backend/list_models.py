import os
import requests
from dotenv import load_dotenv

def list_models():
    load_dotenv()
    key = os.getenv("OPENROUTER_API_KEY")
    print(f"Listing available models on OpenRouter...")
    
    response = requests.get(
        url="https://openrouter.ai/api/v1/models",
        headers={
            "Authorization": f"Bearer {key}",
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"Total models available: {len(data['data'])}")
        # Print first 10 models
        for model in data['data'][:10]:
            print(f"- {model['id']}")
    else:
        print(f"Failed to list models: {response.text}")

if __name__ == "__main__":
    list_models()
