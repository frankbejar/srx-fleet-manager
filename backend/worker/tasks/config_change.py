"""
Configuration Change Tasks
Apply configuration changes with commit-confirmed for safety
"""

import structlog
from datetime import datetime
from typing import List
from jnpr.junos.utils.config import Config
from worker.celery_app import celery_app
from app.database import SessionLocal
from app.models import Device, Job
from app.services import PyEZService, GitService

logger = structlog.get_logger()


@celery_app.task(bind=True, name='worker.tasks.config_change.apply_config_commands')
def apply_config_commands(
    self,
    device_id: int,
    commands: List[str],
    description: str = "Configuration change",
    user_email: str = "system",
    commit_confirmed_timeout: int = 5
):
    """
    Apply configuration commands to a device with commit-confirmed for safety

    Args:
        device_id: Device database ID
        commands: List of JunOS commands to apply
        description: Description of the change
        user_email: Email of user who triggered the change
        commit_confirmed_timeout: Minutes before automatic rollback

    Returns:
        dict: Change result with status and details
    """
    db = SessionLocal()

    try:
        # Get device
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise ValueError(f"Device {device_id} not found")

        logger.info(
            "Starting configuration change",
            hostname=device.hostname,
            device_id=device_id,
            num_commands=len(commands),
            description=description
        )

        # Create job record
        job = Job(
            job_type='config_change',
            device_id=device.id,
            status='running',
            task_id=self.request.id,
            user_email=user_email,
            started_at=datetime.utcnow()
        )
        db.add(job)
        db.commit()

        try:
            # Backup current config first
            logger.info("Creating pre-change backup", hostname=device.hostname)
            git_service = GitService()
            current_config = PyEZService.get_config(device, format='set')
            pre_change_commit = git_service.save_config(
                device,
                current_config,
                "Pre-change backup before: " + description
            )

            # Connect to device and apply changes
            logger.info("Connecting to device for config change", hostname=device.hostname)
            with PyEZService.connect(device) as dev:
                # Bind the Config utility
                dev.bind(cu=Config)

                # Start configuration mode
                logger.info("Loading configuration changes", hostname=device.hostname)

                # Load commands as set commands (join them with newlines)
                config_changes = '\n'.join(commands)
                for cmd in commands:
                    logger.info("Applying command", hostname=device.hostname, command=cmd)

                dev.cu.load(config_changes, format='set')

                # Show diff
                diff = dev.cu.diff()
                if diff:
                    logger.info("Configuration diff", hostname=device.hostname, diff=diff)
                else:
                    logger.warning("No configuration changes detected", hostname=device.hostname)
                    job.status = 'completed'
                    job.finished_at = datetime.utcnow()
                    job.result_json = {
                        'success': True,
                        'message': 'No changes detected',
                        'commands': commands
                    }
                    db.commit()
                    return job.result_json

                # Commit with confirmation
                logger.info(
                    "Committing with confirm",
                    hostname=device.hostname,
                    timeout_minutes=commit_confirmed_timeout
                )
                dev.cu.commit(comment=description, confirm=commit_confirmed_timeout)

                logger.info("Configuration committed, awaiting confirmation", hostname=device.hostname)

                # Perform basic connectivity test
                try:
                    facts = dev.facts
                    logger.info("Device still reachable after change", hostname=device.hostname)

                    # Auto-confirm the commit since device is responding
                    logger.info("Auto-confirming commit", hostname=device.hostname)
                    dev.cu.commit(comment="Confirming change: " + description)

                except Exception as verify_error:
                    logger.error(
                        "Device not responding after change, automatic rollback will occur",
                        hostname=device.hostname,
                        error=str(verify_error)
                    )
                    raise Exception(f"Device connectivity lost after change: {str(verify_error)}")

            # Create post-change backup
            logger.info("Creating post-change backup", hostname=device.hostname)
            new_config = PyEZService.get_config(device, format='set')
            post_change_commit = git_service.save_config(
                device,
                new_config,
                f"Applied: {description}"
            )

            # Update job status
            job.status = 'completed'
            job.finished_at = datetime.utcnow()
            job.result_json = {
                'success': True,
                'message': 'Configuration applied successfully',
                'commands': commands,
                'description': description,
                'diff': diff,
                'pre_commit': pre_change_commit,
                'post_commit': post_change_commit
            }
            db.commit()

            logger.info(
                "Configuration change completed successfully",
                hostname=device.hostname,
                device_id=device_id
            )

            return job.result_json

        except Exception as task_error:
            logger.error(
                "Configuration change failed",
                hostname=device.hostname,
                error=str(task_error),
                exc_info=True
            )

            # Update job with error
            job.status = 'failed'
            job.finished_at = datetime.utcnow()
            job.error_text = str(task_error)
            job.result_json = {
                'success': False,
                'error': str(task_error),
                'commands': commands,
                'description': description
            }
            db.commit()

            raise

    except Exception as e:
        logger.error("Fatal error in config change task", error=str(e), exc_info=True)
        raise
    finally:
        db.close()
