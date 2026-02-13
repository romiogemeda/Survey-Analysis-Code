"""
End-to-End API Demo Script.

Exercises the complete data flow:
  1. Create a Survey Schema
  2. Upload survey responses (JSON)
  3. Score submission quality
  4. Run correlation analysis
  5. Build visualization dashboard
  6. Start a chat session and ask a question

Requires: the server running at http://localhost:8000
  uvicorn src.main:app --reload --port 8000

Run:
  python scripts/demo_api.py
"""

import json
import httpx
import sys

BASE = "http://localhost:8000"


def main():
    client = httpx.Client(base_url=BASE, timeout=60)

    # ── 1. Health check ────────────────────────
    print("\n═══ 1. Health Check ═══")
    r = client.get("/health")
    print(json.dumps(r.json(), indent=2))

    # ── 2. Create Survey Schema ────────────────
    print("\n═══ 2. Create Survey Schema ═══")
    schema = client.post("/api/v1/ingestion/schemas", json={
        "title": "Product Satisfaction Survey v1",
        "version_id": 1,
        "question_definitions": [
            {"question_id": "age", "text": "What is your age?", "data_type": "INTERVAL"},
            {"question_id": "device", "text": "What device do you use?", "data_type": "NOMINAL",
             "options": ["Mobile", "Desktop", "Tablet"]},
            {"question_id": "satisfaction", "text": "Rate your satisfaction (1-5)", "data_type": "ORDINAL",
             "options": ["1", "2", "3", "4", "5"]},
            {"question_id": "ui_rating", "text": "Rate the UI (1-5)", "data_type": "ORDINAL",
             "options": ["1", "2", "3", "4", "5"]},
            {"question_id": "feedback", "text": "Any additional feedback?", "data_type": "OPEN_ENDED"},
        ],
    })
    schema_data = schema.json()
    schema_id = schema_data["id"]
    print(f"Schema created: {schema_id}")

    # ── 3. Upload Survey Responses ─────────────
    print("\n═══ 3. Upload Survey Responses (JSON) ═══")
    responses = [
        {"age": "25", "device": "Mobile", "satisfaction": "4", "ui_rating": "5",
         "feedback": "Love the app, very intuitive and fast!"},
        {"age": "42", "device": "Desktop", "satisfaction": "3", "ui_rating": "2",
         "feedback": "The desktop version feels clunky and outdated."},
        {"age": "31", "device": "Mobile", "satisfaction": "5", "ui_rating": "5",
         "feedback": "Best survey tool I've ever used. Highly recommend!"},
        {"age": "55", "device": "Tablet", "satisfaction": "2", "ui_rating": "3",
         "feedback": "Hard to navigate on my tablet, buttons are too small."},
        {"age": "28", "device": "Mobile", "satisfaction": "4", "ui_rating": "4",
         "feedback": "Pretty good overall, a few minor issues with loading speed."},
        {"age": "35", "device": "Desktop", "satisfaction": "1", "ui_rating": "1",
         "feedback": "Terrible experience. Crashed multiple times."},
        {"age": "22", "device": "Mobile", "satisfaction": "5", "ui_rating": "5",
         "feedback": "Amazing UX! Smooth and beautiful design."},
        {"age": "48", "device": "Desktop", "satisfaction": "3", "ui_rating": "3",
         "feedback": "It's okay. Nothing special but gets the job done."},
        {"age": "29", "device": "Mobile", "satisfaction": "4", "ui_rating": "4",
         "feedback": "Good experience on mobile. Would love dark mode."},
        {"age": "60", "device": "Tablet", "satisfaction": "2", "ui_rating": "2",
         "feedback": "Text is too small. Needs better accessibility options."},
        # A low-quality straight-liner
        {"age": "19", "device": "Mobile", "satisfaction": "3", "ui_rating": "3",
         "feedback": "ok ok ok ok ok ok ok ok ok ok"},
        # Another good response
        {"age": "37", "device": "Desktop", "satisfaction": "4", "ui_rating": "3",
         "feedback": "Functionality is great but the design could be more modern."},
    ]

    upload_data = json.dumps(responses).encode()
    r = client.post(
        f"/api/v1/ingestion/upload/{schema_id}",
        files={"file": ("responses.json", upload_data, "application/json")},
    )
    print(json.dumps(r.json(), indent=2))

    # ── 4. Score Quality ───────────────────────
    print("\n═══ 4. Score Submission Quality ═══")
    r = client.post(f"/api/v1/quality/score-batch/{schema_id}")
    quality_result = r.json()
    print(json.dumps(quality_result, indent=2))

    # ── 5. Run Correlation Analysis ────────────
    print("\n═══ 5. Run Correlation Analysis ═══")
    r = client.post(f"/api/v1/analytics/correlations/{schema_id}")
    corr_result = r.json()
    print(f"Pairs analyzed: {corr_result['total_pairs_analyzed']}")
    print(f"Significant: {corr_result['significant']}")
    for res in corr_result.get("results", []):
        if res.get("is_significant"):
            print(f"  ★ {res['independent_variable']} ↔ {res['dependent_variable']} "
                  f"({res['method']}, p={res['p_value']})")

    # ── 6. Get Insights ────────────────────────
    print("\n═══ 6. Get Insights ═══")
    r = client.get(f"/api/v1/analytics/insights/{schema_id}")
    insights = r.json()
    print(f"Total insights: {len(insights)}")
    for i in insights[:5]:
        print(f"  [{i['severity']}] {i['insight_text']}")

    # ── 7. Build Visualization Dashboard ───────
    print("\n═══ 7. Build Visualization Dashboard ═══")
    r = client.post(f"/api/v1/visualization/dashboard/{schema_id}")
    charts = r.json()
    for chart in charts:
        print(f"  📊 {chart['question_id']} → {chart['chart_type']}: "
              f"{dict(zip(chart['labels'][:3], chart['values'][:3]))}")

    # ── 8. Sentiment Analysis ──────────────────
    print("\n═══ 8. Sentiment Analysis ═══")
    feedback_texts = [r["feedback"] for r in responses]
    r = client.post("/api/v1/visualization/sentiment", json={"texts": feedback_texts})
    sentiments = r.json()
    for s in sentiments[:5]:
        print(f"  {s['label']:>8} ({s['polarity']:+.2f}): {s['text'][:50]}...")

    # ── 9. Start Chat Session ──────────────────
    print("\n═══ 9. Chat Assistant — Start Session ═══")
    r = client.post("/api/v1/chat/sessions", json={
        "survey_schema_id": schema_id,
        "session_type": "DATA_QUERY",
    })
    session_data = r.json()
    session_id = session_data["session_id"]
    print(f"Chat session started: {session_id}")

    # Note: The chat message endpoint requires LLM access.
    # If you don't have an LLM API key configured, this will fail.
    # Uncomment to test:
    # print("\n═══ 10. Chat — Ask a Question ═══")
    # r = client.post("/api/v1/chat/messages", json={
    #     "session_id": session_id,
    #     "content": "Show me the satisfaction distribution for mobile users",
    # })
    # print(json.dumps(r.json(), indent=2))

    print("\n✅ Demo complete! Visit http://localhost:8000/api/docs for Swagger UI")


if __name__ == "__main__":
    try:
        main()
    except httpx.ConnectError:
        print("❌ Could not connect. Start the server first:")
        print("   uvicorn src.main:app --reload --port 8000")
        sys.exit(1)