"""
Celery Application
Background task queue configuration
"""

from celery import Celery
from celery.schedules import crontab
from app.settings import get_settings

settings = get_settings()

# Create Celery app
celery_app = Celery(
    'srx_fleet',
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

# Configure Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone=settings.celery_timezone,
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes max
    task_soft_time_limit=1500,  # 25 minute warning
    worker_prefetch_multiplier=1,  # One task at a time per worker
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks
    task_routes={
        'worker.tasks.backup.*': {'queue': 'backup'},
        'worker.tasks.health.*': {'queue': 'health'},
        'worker.tasks.change.*': {'queue': 'change'},
        'worker.tasks.config_change.*': {'queue': 'change'},
    },
)

# Import tasks
from worker.tasks import backup, health, config_change

# Scheduled tasks (Celery Beat)
beat_schedule = {}

# Add nightly backup schedule if enabled
if settings.backup_schedule_enabled:
    beat_schedule['nightly-backup-all-devices'] = {
        'task': 'worker.tasks.backup.backup_all_devices',
        'schedule': crontab(hour=2, minute=0),  # 2 AM daily
    }

# Add health check schedule if enabled (separate from backup schedule)
if settings.health_check_schedule_enabled:
    beat_schedule['health-check-all-devices'] = {
        'task': 'worker.tasks.health.health_check_all_devices',
        'schedule': settings.health_check_interval,  # Every 5 minutes
    }

# Apply the schedule if any tasks are defined
if beat_schedule:
    celery_app.conf.beat_schedule = beat_schedule
