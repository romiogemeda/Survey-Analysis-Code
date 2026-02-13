"""Celery Worker Configuration. Run: celery -A workers.celery_app worker --loglevel=info"""

from celery import Celery
from config.settings import get_settings

settings = get_settings()

celery_app = Celery(
    "survey_analysis",
    broker=settings.celery.broker_url,
    backend=settings.celery.result_backend,
)
celery_app.conf.update(
    task_soft_time_limit=settings.celery.task_soft_time_limit,
    task_hard_time_limit=settings.celery.task_hard_time_limit,
    task_serializer="json", result_serializer="json",
    accept_content=["json"], timezone="UTC", enable_utc=True,
    task_routes={
        "workers.analytics_tasks.*": {"queue": "analytics"},
        "workers.simulation_tasks.*": {"queue": "simulation"},
    },
)
celery_app.autodiscover_tasks(["workers"])