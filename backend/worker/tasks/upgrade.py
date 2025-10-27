"""
Firmware Upgrade Tasks
Handles SRX firmware upgrades with AI-assisted validation
"""

import structlog
from celery import shared_task
from sqlalchemy.orm import Session
from datetime import datetime
import os

from app.database import SessionLocal
from app.models import Device, Job
from app.services import PyEZService, GitService, AIService
from app.settings import get_settings

logger = structlog.get_logger()
settings = get_settings()


@shared_task(bind=True, name="worker.tasks.upgrade.upgrade_device")
def upgrade_device(self, device_id: int, firmware_version: str, user_email: str = "system"):
    """
    Perform firmware upgrade on SRX device with AI assistance

    Args:
        device_id: Device ID
        firmware_version: Target firmware version (e.g., "23.4R2.13")
        user_email: User who initiated upgrade

    Returns:
        dict: Upgrade results with AI analysis
    """
    db = SessionLocal()

    try:
        # Create job record
        job = Job(
            job_type="upgrade",
            device_id=device_id,
            status="running",
            task_id=self.request.id,
            queued_at=datetime.utcnow(),
            started_at=datetime.utcnow(),
            user_email=user_email
        )
        db.add(job)
        db.commit()

        logger.info("Starting firmware upgrade",
                   device_id=device_id,
                   target_version=firmware_version,
                   task_id=self.request.id)

        # Get device
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise ValueError(f"Device {device_id} not found")

        # Find firmware file
        firmware_file = find_firmware_file(firmware_version)
        if not firmware_file:
            raise ValueError(f"Firmware version {firmware_version} not found")

        logger.info("Firmware file located", firmware_file=firmware_file)

        # Initialize services
        srx_service = PyEZService(device)
        git_service = GitService()
        ai_service = AIService()

        # Step 1: AI Readiness Check
        logger.info("Running AI readiness analysis")
        health_check = srx_service.health_check()

        device_info = {
            'hostname': device.hostname,
            'model': device.model,
            'current_version': device.junos_version
        }

        readiness = ai_service.analyze_upgrade_readiness(
            device_info=device_info,
            target_version=firmware_version,
            health_data=health_check
        )

        if not readiness.get('success'):
            raise ValueError(f"AI readiness analysis failed: {readiness.get('error')}")

        analysis = readiness['analysis']
        if not analysis.get('ready'):
            raise ValueError(f"Device not ready for upgrade: {analysis.get('summary')}")

        logger.info("AI readiness check passed",
                   risk=analysis.get('overall_risk'),
                   confidence=analysis.get('confidence'))

        # Step 2: Generate AI Upgrade Plan
        logger.info("Generating AI upgrade plan")
        plan_result = ai_service.generate_upgrade_plan(
            device_info=device_info,
            target_version=firmware_version,
            firmware_path=os.path.basename(firmware_file)
        )

        if not plan_result.get('success'):
            raise ValueError(f"Failed to generate upgrade plan: {plan_result.get('error')}")

        upgrade_plan = plan_result['plan']
        logger.info("Upgrade plan generated", steps=len(upgrade_plan.get('steps', [])))

        # Step 3: Pre-upgrade backup
        logger.info("Creating pre-upgrade backup")
        pre_config = srx_service.get_configuration()
        pre_backup_commit = git_service.commit_config(
            device=device,
            config_content=pre_config,
            message=f"Pre-upgrade backup before {firmware_version}"
        )

        pre_upgrade_state = {
            'version': device.junos_version,
            'alarms': health_check.get('alarms'),
            'storage': health_check.get('storage'),
            'interfaces_up': health_check.get('interfaces'),
            'tunnels': health_check.get('tunnels'),
            'commit_sha': pre_backup_commit
        }

        # Step 4: Create snapshot
        logger.info("Creating system snapshot")
        snapshot_result = srx_service.execute_rpc_call('request-snapshot', {
            'slice': 'alternate'
        })
        logger.info("Snapshot created", result=snapshot_result)

        # Step 5: Upload firmware
        logger.info("Uploading firmware to device")
        remote_path = f"/var/tmp/{os.path.basename(firmware_file)}"

        with srx_service.dev.opensftp() as sftp:
            sftp.put(firmware_file, remote_path)

        logger.info("Firmware uploaded", remote_path=remote_path)

        # Step 6: Install firmware
        logger.info("Installing firmware (this may take 10-15 minutes)")
        install_result = srx_service.execute_rpc_call('request-package-add', {
            'package-name': remote_path,
            'no-validate': True,
            'unlink': True  # Remove file after install
        })

        logger.info("Firmware installation initiated", result=install_result)

        # Step 7: Reboot device
        logger.info("Rebooting device")
        srx_service.execute_rpc_call('request-reboot', {})

        # Wait for reboot (device will disconnect)
        logger.info("Device rebooting, waiting 5 minutes for it to come back online")
        import time
        time.sleep(300)  # Wait 5 minutes

        # Step 8: Verify device is back online
        logger.info("Attempting to reconnect to device")
        max_retries = 12  # 12 retries = 6 minutes
        for i in range(max_retries):
            try:
                time.sleep(30)  # Wait 30 seconds between attempts
                srx_service = PyEZService(device)  # Reconnect
                post_health = srx_service.health_check()
                logger.info("Device reconnected", attempt=i+1)
                break
            except Exception as e:
                logger.info("Reconnection attempt failed", attempt=i+1, error=str(e))
                if i == max_retries - 1:
                    raise ValueError("Device did not come back online after reboot")

        # Step 9: Post-upgrade validation
        logger.info("Running post-upgrade validation")
        post_config = srx_service.get_configuration()
        post_backup_commit = git_service.commit_config(
            device=device,
            config_content=post_config,
            message=f"Post-upgrade backup after {firmware_version}"
        )

        # Get new version
        facts = srx_service.dev.facts
        new_version = facts.get('version', 'Unknown')

        post_upgrade_state = {
            'version': new_version,
            'alarms': post_health.get('alarms'),
            'storage': post_health.get('storage'),
            'interfaces_up': post_health.get('interfaces'),
            'tunnels': post_health.get('tunnels'),
            'boot_time': post_health.get('uptime'),
            'commit_sha': post_backup_commit
        }

        # Step 10: AI Result Analysis
        logger.info("Running AI post-upgrade analysis")
        result_analysis = ai_service.analyze_upgrade_result(
            pre_upgrade_data=pre_upgrade_state,
            post_upgrade_data=post_upgrade_state,
            device_hostname=device.hostname
        )

        if not result_analysis.get('success'):
            logger.warning("AI analysis failed", error=result_analysis.get('error'))
            ai_recommendation = {'recommendation': 'investigate', 'summary': 'AI analysis unavailable'}
        else:
            ai_recommendation = result_analysis['analysis']

        logger.info("AI upgrade analysis complete",
                   recommendation=ai_recommendation.get('recommendation'),
                   success=ai_recommendation.get('success'))

        # Update device version
        device.junos_version = new_version
        device.last_seen_at = datetime.utcnow()
        db.commit()

        # Prepare result
        result = {
            'success': ai_recommendation.get('success', True),
            'previous_version': pre_upgrade_state['version'],
            'new_version': new_version,
            'upgrade_plan': upgrade_plan,
            'readiness_analysis': readiness['analysis'],
            'ai_recommendation': ai_recommendation,
            'pre_backup_commit': pre_backup_commit,
            'post_backup_commit': post_backup_commit,
            'pre_upgrade_health': pre_upgrade_state,
            'post_upgrade_health': post_upgrade_state
        }

        # Update job
        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_json = result
        db.commit()

        logger.info("Firmware upgrade completed successfully",
                   device_id=device_id,
                   new_version=new_version,
                   recommendation=ai_recommendation.get('recommendation'))

        return result

    except Exception as e:
        logger.error("Firmware upgrade failed",
                    device_id=device_id,
                    error=str(e),
                    exc_info=True)

        if 'job' in locals():
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.error_text = str(e)
            db.commit()

        raise

    finally:
        db.close()


def find_firmware_file(version: str) -> str:
    """
    Find firmware file matching version

    Args:
        version: Version string (e.g., "23.4R2.13")

    Returns:
        str: Full path to firmware file
    """
    firmware_root = os.path.join(settings.artifact_root, "firmware")

    # Extract major version (e.g., "23" from "23.4R2.13")
    major_version = version.split('.')[0]

    # Search in version directory
    version_dir = os.path.join(firmware_root, f"{major_version}.x")

    if not os.path.exists(version_dir):
        logger.warning("Version directory not found", version_dir=version_dir)
        return None

    # Look for matching .tgz file
    for filename in os.listdir(version_dir):
        if filename.endswith('.tgz') and version in filename:
            full_path = os.path.join(version_dir, filename)
            logger.info("Found firmware file", path=full_path, version=version)
            return full_path

    logger.warning("Firmware file not found", version=version, searched=version_dir)
    return None


def list_available_firmware() -> list:
    """
    List all available firmware versions

    Returns:
        list: Available firmware files with metadata
    """
    firmware_root = os.path.join(settings.artifact_root, "firmware")
    firmware_list = []

    if not os.path.exists(firmware_root):
        logger.warning("Firmware directory does not exist", path=firmware_root)
        return []

    for version_dir in os.listdir(firmware_root):
        version_path = os.path.join(firmware_root, version_dir)

        if not os.path.isdir(version_path):
            continue

        for filename in os.listdir(version_path):
            if filename.endswith('.tgz'):
                full_path = os.path.join(version_path, filename)
                file_size = os.path.getsize(full_path)

                # Extract version from filename (e.g., "junos-srxsme-23.4R2.13.tgz" -> "23.4R2.13")
                version = filename.replace('junos-srxsme-', '').replace('junos-install-srxsme-mips-64-', '').replace('.tgz', '')

                firmware_list.append({
                    'version': version,
                    'filename': filename,
                    'path': full_path,
                    'size_bytes': file_size,
                    'size_mb': round(file_size / (1024 * 1024), 1),
                    'major_version': version_dir
                })

    # Sort by version
    firmware_list.sort(key=lambda x: x['version'], reverse=True)

    logger.info("Listed available firmware", count=len(firmware_list))
    return firmware_list
