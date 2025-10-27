"""
Health Check Tasks
Device health monitoring operations
"""

import structlog
from datetime import datetime
from worker.celery_app import celery_app
from app.database import SessionLocal
from app.models import Device, Job
from app.services import PyEZService

logger = structlog.get_logger()


@celery_app.task(bind=True, name='worker.tasks.health.health_check_device')
def health_check_device(self, device_id: int, user_email: str = "system"):
    """
    Perform health check on a single device

    Args:
        device_id: Device database ID
        user_email: Email of user who triggered check

    Returns:
        dict: Health check results
    """
    db = SessionLocal()

    try:
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise ValueError(f"Device {device_id} not found")

        logger.info("Starting health check", hostname=device.hostname)

        # Create job
        job = Job(
            job_type='health',
            device_id=device.id,
            status='running',
            task_id=self.request.id,
            user_email=user_email,
            started_at=datetime.utcnow()
        )
        db.add(job)
        db.commit()

        try:
            # Get device facts
            facts = PyEZService.get_facts(device)

            # Get storage info
            storage = PyEZService.get_system_storage(device)

            # Get tunnel status (optional - some devices don't support this)
            tunnels = []
            try:
                tunnels = PyEZService.get_ipsec_sa(device)
            except Exception as e:
                logger.warning(
                    "Could not get IPsec SA (device may not support this command)",
                    hostname=device.hostname,
                    error=str(e)
                )

            # Update device info
            device.model = facts.get('model')
            device.junos_version = facts.get('version')
            device.serial_number = facts.get('serial_number')
            device.last_seen_at = datetime.utcnow()

            # Update job
            job.status = 'success'
            job.finished_at = datetime.utcnow()
            job.result_json = {
                'facts': facts,
                'storage': storage,
                'tunnel_count': len(tunnels),
                'tunnels': tunnels
            }

            db.commit()

            logger.info(
                "Health check completed",
                hostname=device.hostname,
                version=facts.get('version'),
                tunnels=len(tunnels)
            )

            return {
                'success': True,
                'device_id': device.id,
                'hostname': device.hostname,
                'facts': facts,
                'storage': storage,
                'tunnels': len(tunnels)
            }

        except Exception as e:
            logger.error("Health check failed", hostname=device.hostname, error=str(e))

            job.status = 'failed'
            job.finished_at = datetime.utcnow()
            job.error_text = str(e)
            db.commit()

            return {
                'success': False,
                'device_id': device.id,
                'hostname': device.hostname,
                'error': str(e)
            }

    finally:
        db.close()


@celery_app.task(name='worker.tasks.health.health_check_all_devices')
def health_check_all_devices():
    """Health check all enabled devices"""
    db = SessionLocal()

    try:
        devices = db.query(Device).filter(Device.enabled == True).all()

        logger.info("Starting health check of all devices", count=len(devices))

        results = {'total': len(devices), 'devices': []}

        for device in devices:
            try:
                task = health_check_device.delay(device.id)
                results['devices'].append({
                    'device_id': device.id,
                    'hostname': device.hostname,
                    'task_id': task.id
                })
            except Exception as e:
                logger.error("Failed to queue health check", hostname=device.hostname, error=str(e))

        return results

    finally:
        db.close()
