"""
Backup Tasks
Configuration backup operations
"""

import structlog
from datetime import datetime
from worker.celery_app import celery_app
from app.database import SessionLocal
from app.models import Device, Job, ConfigBackup
from app.services import PyEZService, GitService

logger = structlog.get_logger()


@celery_app.task(bind=True, name='worker.tasks.backup.backup_device')
def backup_device(self, device_id: int, user_email: str = "system"):
    """
    Backup a single device configuration

    Args:
        device_id: Device database ID
        user_email: Email of user who triggered backup

    Returns:
        dict: Backup result
    """
    db = SessionLocal()

    try:
        # Get device
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise ValueError(f"Device {device_id} not found")

        logger.info("Starting config backup", hostname=device.hostname, device_id=device_id)

        # Create job record
        job = Job(
            job_type='backup',
            device_id=device.id,
            status='running',
            task_id=self.request.id,
            user_email=user_email,
            started_at=datetime.utcnow()
        )
        db.add(job)
        db.commit()

        try:
            # Get configuration using PyEZ
            logger.info("Fetching configuration", hostname=device.hostname)
            config_text = PyEZService.get_config(device, format='set')

            # Save to Git
            logger.info("Saving to git", hostname=device.hostname)
            git_service = GitService()
            file_path, commit_sha = git_service.save_config(
                device,
                config_text,
                message=f"Automated backup - {device.hostname}"
            )

            # Create backup record
            backup = ConfigBackup(
                device_id=device.id,
                file_path=file_path,
                size_bytes=len(config_text),
                git_commit_sha=commit_sha,
                backup_type='scheduled' if user_email == 'system' else 'manual',
                triggered_by=user_email
            )
            db.add(backup)

            # Update device
            device.last_backup_at = datetime.utcnow()

            # Update job
            job.status = 'success'
            job.finished_at = datetime.utcnow()
            job.result_json = {
                'config_size': len(config_text),
                'lines': config_text.count('\n'),
                'commit_sha': commit_sha,
                'file_path': file_path
            }

            db.commit()

            logger.info(
                "Backup completed successfully",
                hostname=device.hostname,
                commit_sha=commit_sha[:8] if commit_sha else None,
                size=len(config_text)
            )

            return {
                'success': True,
                'device_id': device.id,
                'hostname': device.hostname,
                'commit_sha': commit_sha,
                'file_path': file_path,
                'size': len(config_text)
            }

        except Exception as e:
            logger.error("Backup failed", hostname=device.hostname, error=str(e))

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

    except Exception as e:
        logger.error("Backup task error", device_id=device_id, error=str(e))
        raise

    finally:
        db.close()


@celery_app.task(name='worker.tasks.backup.backup_all_devices')
def backup_all_devices():
    """
    Backup all enabled devices (scheduled task)

    Returns:
        dict: Summary of results
    """
    db = SessionLocal()

    try:
        # Get all enabled devices
        devices = db.query(Device).filter(Device.enabled == True).all()

        logger.info("Starting backup of all devices", count=len(devices))

        results = {
            'total': len(devices),
            'success': 0,
            'failed': 0,
            'devices': []
        }

        # Queue backup for each device
        for device in devices:
            try:
                # Queue backup task
                task = backup_device.delay(device.id, user_email="system")

                results['devices'].append({
                    'device_id': device.id,
                    'hostname': device.hostname,
                    'task_id': task.id
                })

                logger.info("Queued backup", hostname=device.hostname, task_id=task.id)

            except Exception as e:
                logger.error("Failed to queue backup", hostname=device.hostname, error=str(e))
                results['failed'] += 1

        logger.info("Backup queue complete", queued=len(results['devices']))

        return results

    finally:
        db.close()


@celery_app.task(name='worker.tasks.backup.backup_by_region')
def backup_by_region(region: str, user_email: str = "system"):
    """
    Backup all devices in a specific region

    Args:
        region: Region name
        user_email: Email of user who triggered backup

    Returns:
        dict: Summary of results
    """
    db = SessionLocal()

    try:
        devices = db.query(Device).filter(
            Device.enabled == True,
            Device.region == region
        ).all()

        logger.info("Starting regional backup", region=region, count=len(devices))

        results = {
            'region': region,
            'total': len(devices),
            'devices': []
        }

        for device in devices:
            task = backup_device.delay(device.id, user_email=user_email)
            results['devices'].append({
                'device_id': device.id,
                'hostname': device.hostname,
                'task_id': task.id
            })

        return results

    finally:
        db.close()
