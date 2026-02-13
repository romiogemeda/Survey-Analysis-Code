FROM python:3.12-slim AS base

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

# Application code
COPY . .

# Expose port
EXPOSE 8000

# Default: run the FastAPI server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]