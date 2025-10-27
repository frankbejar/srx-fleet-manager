"""
Devices API Router
Endpoints for device management
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models import Device
from app.schemas.device import DeviceResponse, DeviceCreate, DeviceUpdate
from worker.tasks.backup import backup_device
from worker.tasks.health import health_check_device

router = APIRouter()


@router.get("/", response_model=List[DeviceResponse])
def list_devices(
    skip: int = 0,
    limit: int = 100,
    region: Optional[str] = None,
    enabled: Optional[bool] = True,
    db: Session = Depends(get_db)
):
    """List all devices with optional filtering"""
    query = db.query(Device)

    if region:
        query = query.filter(Device.region == region)

    if enabled is not None:
        query = query.filter(Device.enabled == enabled)

    devices = query.offset(skip).limit(limit).all()
    return devices


@router.get("/regions")
def list_regions(db: Session = Depends(get_db)):
    """Get list of unique regions"""
    from sqlalchemy import func

    results = db.query(Device.region, func.count(Device.id)).group_by(Device.region).all()

    return [
        {"region": region, "count": count}
        for region, count in results
        if region
    ]


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Get fleet statistics"""
    from sqlalchemy import func
    from datetime import datetime, timedelta

    total = db.query(func.count(Device.id)).scalar()
    enabled = db.query(func.count(Device.id)).filter(Device.enabled == True).scalar()

    # By region
    by_region = db.query(
        Device.region,
        func.count(Device.id)
    ).filter(Device.enabled == True).group_by(Device.region).all()

    # By WAN type
    by_wan = db.query(
        Device.wan_type,
        func.count(Device.id)
    ).filter(Device.enabled == True).group_by(Device.wan_type).all()

    # By JunOS version
    by_junos = db.query(
        Device.junos_version,
        func.count(Device.id)
    ).filter(
        Device.enabled == True,
        Device.junos_version.isnot(None)
    ).group_by(Device.junos_version).all()

    # By model
    by_model = db.query(
        Device.model,
        func.count(Device.id)
    ).filter(
        Device.enabled == True,
        Device.model.isnot(None)
    ).group_by(Device.model).all()

    # Backup health - devices with backups in last 7 days
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    devices_with_recent_backup = db.query(func.count(Device.id)).filter(
        Device.enabled == True,
        Device.last_backup_at >= seven_days_ago
    ).scalar()

    # Devices never backed up
    devices_never_backed_up = db.query(func.count(Device.id)).filter(
        Device.enabled == True,
        Device.last_backup_at.is_(None)
    ).scalar()

    # Stale devices - haven't checked in via UptimeRobot in last 1 hour
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    stale_devices_count = db.query(func.count(Device.id)).filter(
        Device.enabled == True,
        (Device.last_seen_at.is_(None) | (Device.last_seen_at < one_hour_ago))
    ).scalar()

    # Get detailed list of stale devices for dashboard
    stale_devices = db.query(Device).filter(
        Device.enabled == True,
        (Device.last_seen_at.is_(None) | (Device.last_seen_at < one_hour_ago))
    ).order_by(Device.last_seen_at.desc().nullslast()).limit(15).all()

    stale_device_list = [{
        'id': d.id,
        'hostname': d.hostname,
        'region': d.region,
        'last_seen_at': d.last_seen_at.isoformat() if d.last_seen_at else None,
        'minutes_since_last_check': int((datetime.utcnow() - d.last_seen_at).total_seconds() / 60) if d.last_seen_at else None
    } for d in stale_devices]

    return {
        'total_devices': total,
        'enabled_devices': enabled,
        'disabled_devices': total - enabled,
        'devices_with_recent_backup': devices_with_recent_backup or 0,
        'devices_never_backed_up': devices_never_backed_up or 0,
        'backup_coverage_percent': round((devices_with_recent_backup or 0) / enabled * 100, 1) if enabled > 0 else 0,
        'stale_devices_count': stale_devices_count or 0,
        'stale_devices': stale_device_list,
        'by_region': {region: count for region, count in by_region if region},
        'by_wan_type': {wan: count for wan, count in by_wan if wan},
        'by_junos_version': {version: count for version, count in by_junos if version},
        'by_model': {model: count for model, count in by_model if model}
    }


# ============================================================================
# FIRMWARE UPGRADE ENDPOINTS
# ============================================================================

@router.get("/firmware")
def list_firmware():
    """List all available firmware versions"""
    from worker.tasks.upgrade import list_available_firmware

    firmware_list = list_available_firmware()

    return {
        "success": True,
        "firmware": firmware_list,
        "count": len(firmware_list)
    }


class UpgradeReadinessRequest(BaseModel):
    target_version: str


@router.post("/{device_id}/upgrade-readiness")
def check_upgrade_readiness(
    device_id: int,
    request: UpgradeReadinessRequest,
    db: Session = Depends(get_db)
):
    """
    AI-powered upgrade readiness check

    Args:
        device_id: Device ID
        request: Target firmware version

    Returns:
        dict: AI analysis of upgrade readiness
    """
    from app.services.ai_service import AIService
    from app.models import Job

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Get latest health check
    health_job = db.query(Job).filter(
        Job.device_id == device_id,
        Job.job_type == 'health_check',
        Job.status == 'completed'
    ).order_by(Job.finished_at.desc()).first()

    health_data = health_job.result_json if health_job else None

    # Run AI readiness analysis
    device_info = {
        'hostname': device.hostname,
        'model': device.model,
        'current_version': device.junos_version
    }

    ai_service = AIService()
    result = ai_service.analyze_upgrade_readiness(
        device_info=device_info,
        target_version=request.target_version,
        health_data=health_data
    )

    if not result.get('success'):
        raise HTTPException(
            status_code=500,
            detail=result.get('error', 'Readiness analysis failed')
        )

    return {
        "success": True,
        "device_id": device.id,
        "hostname": device.hostname,
        "current_version": device.junos_version,
        "target_version": request.target_version,
        "readiness": result['analysis']
    }


class UpgradeRequest(BaseModel):
    firmware_version: str
    user_email: str = "api_user"


@router.post("/{device_id}/upgrade")
def initiate_upgrade(
    device_id: int,
    request: UpgradeRequest,
    db: Session = Depends(get_db)
):
    """
    Initiate firmware upgrade with AI assistance

    Args:
        device_id: Device ID
        request: Upgrade request with firmware version

    Returns:
        dict: Upgrade task details
    """
    from worker.tasks.upgrade import upgrade_device

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Queue upgrade task
    task = upgrade_device.delay(
        device_id=device_id,
        firmware_version=request.firmware_version,
        user_email=request.user_email
    )

    return {
        "message": "Firmware upgrade initiated",
        "device_id": device_id,
        "hostname": device.hostname,
        "target_version": request.firmware_version,
        "task_id": task.id,
        "warning": "Device will reboot during upgrade. Estimated time: 15-20 minutes."
    }


@router.post("/{device_id}/generate-upgrade-plan")
def generate_upgrade_plan(
    device_id: int,
    request: UpgradeReadinessRequest,
    db: Session = Depends(get_db)
):
    """
    Generate AI-powered upgrade plan

    Args:
        device_id: Device ID
        request: Target firmware version

    Returns:
        dict: Detailed upgrade procedure
    """
    from app.services.ai_service import AIService
    from worker.tasks.upgrade import find_firmware_file

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Find firmware file
    firmware_path = find_firmware_file(request.target_version)
    if not firmware_path:
        raise HTTPException(
            status_code=404,
            detail=f"Firmware version {request.target_version} not found"
        )

    device_info = {
        'hostname': device.hostname,
        'model': device.model,
        'current_version': device.junos_version
    }

    ai_service = AIService()
    result = ai_service.generate_upgrade_plan(
        device_info=device_info,
        target_version=request.target_version,
        firmware_path=firmware_path
    )

    if not result.get('success'):
        raise HTTPException(
            status_code=500,
            detail=result.get('error', 'Plan generation failed')
        )

    return {
        "success": True,
        "device_id": device.id,
        "hostname": device.hostname,
        "target_version": request.target_version,
        "plan": result['plan']
    }



@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(device_id: int, db: Session = Depends(get_db)):
    """Get a specific device"""
    device = db.query(Device).filter(Device.id == device_id).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    return device


@router.post("/", response_model=DeviceResponse)
def create_device(device_data: DeviceCreate, db: Session = Depends(get_db)):
    """Create a new device"""
    # Check if device with this IP already exists
    existing = db.query(Device).filter(Device.mgmt_ip == device_data.mgmt_ip).first()
    if existing:
        raise HTTPException(status_code=400, detail="Device with this IP already exists")

    device = Device(**device_data.dict())
    db.add(device)
    db.commit()
    db.refresh(device)

    return device


@router.put("/{device_id}", response_model=DeviceResponse)
def update_device(device_id: int, device_data: DeviceUpdate, db: Session = Depends(get_db)):
    """Update a device"""
    device = db.query(Device).filter(Device.id == device_id).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Update fields
    for key, value in device_data.dict(exclude_unset=True).items():
        setattr(device, key, value)

    db.commit()
    db.refresh(device)

    return device


@router.delete("/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db)):
    """Delete a device"""
    device = db.query(Device).filter(Device.id == device_id).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    db.delete(device)
    db.commit()

    return {"message": "Device deleted successfully"}


@router.post("/{device_id}/backup")
def trigger_backup(device_id: int, db: Session = Depends(get_db)):
    """Trigger a backup for a device"""
    device = db.query(Device).filter(Device.id == device_id).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Queue backup task
    task = backup_device.delay(device_id, user_email="api_user")

    return {
        "message": "Backup queued",
        "device_id": device_id,
        "hostname": device.hostname,
        "task_id": task.id
    }


@router.post("/{device_id}/health-check")
def trigger_health_check(device_id: int, db: Session = Depends(get_db)):
    """Trigger a health check for a device"""
    device = db.query(Device).filter(Device.id == device_id).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Queue health check task
    task = health_check_device.delay(device_id, user_email="api_user")

    return {
        "message": "Health check queued",
        "device_id": device_id,
        "hostname": device.hostname,
        "task_id": task.id
    }


@router.get("/{device_id}/backups")
def get_device_backups(device_id: int, limit: int = 10, db: Session = Depends(get_db)):
    """Get backup history for a device"""
    from app.models import ConfigBackup

    device = db.query(Device).filter(Device.id == device_id).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    backups = db.query(ConfigBackup).filter(
        ConfigBackup.device_id == device_id
    ).order_by(ConfigBackup.backed_up_at.desc()).limit(limit).all()

    return backups


@router.get("/{device_id}/backups/{backup_id}/content")
def get_backup_content(device_id: int, backup_id: int, db: Session = Depends(get_db)):
    """Get the configuration content for a specific backup"""
    from app.models import ConfigBackup
    from app.services import GitService
    from fastapi.responses import PlainTextResponse

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    backup = db.query(ConfigBackup).filter(
        ConfigBackup.id == backup_id,
        ConfigBackup.device_id == device_id
    ).first()

    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    try:
        git_service = GitService()
        config_text = git_service.get_config_at_commit(device, backup.git_commit_sha)
        return PlainTextResponse(config_text, media_type="text/plain")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving config: {str(e)}")


@router.get("/{device_id}/jobs")
def get_device_jobs(device_id: int, limit: int = 20, db: Session = Depends(get_db)):
    """Get job history for a device"""
    from app.models import Job

    device = db.query(Device).filter(Device.id == device_id).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    jobs = db.query(Job).filter(
        Job.device_id == device_id
    ).order_by(Job.queued_at.desc()).limit(limit).all()

    return jobs


@router.post("/{device_id}/analyze")
def analyze_device_config(device_id: int, backup_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    AI-powered configuration analysis

    Args:
        device_id: Device ID
        backup_id: Optional specific backup to analyze (uses latest if not specified)
    """
    from app.models import ConfigBackup
    from app.services.ai_service import AIService
    from app.services import GitService

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Get the backup to analyze
    if backup_id:
        backup = db.query(ConfigBackup).filter(
            ConfigBackup.id == backup_id,
            ConfigBackup.device_id == device_id
        ).first()
        if not backup:
            raise HTTPException(status_code=404, detail="Backup not found")
    else:
        # Get latest backup
        backup = db.query(ConfigBackup).filter(
            ConfigBackup.device_id == device_id
        ).order_by(ConfigBackup.backed_up_at.desc()).first()

        if not backup:
            raise HTTPException(status_code=404, detail="No backups found for this device")

    try:
        # Retrieve config from Git
        git_service = GitService()
        config_text = git_service.get_config_at_commit(device, backup.git_commit_sha)

        # Analyze with AI
        ai_service = AIService()
        result = ai_service.analyze_config(config_text, device.hostname)

        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('error', 'Analysis failed'))

        return {
            "success": True,
            "device_id": device.id,
            "hostname": device.hostname,
            "backup_id": backup.id,
            "backup_date": backup.backed_up_at,
            "analysis": result['analysis']
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


from pydantic import BaseModel

class ApplyCommandsRequest(BaseModel):
    commands: List[str]
    description: str = "Configuration change"
    user_email: str = "api_user"


@router.post("/{device_id}/apply-commands")
def apply_config_commands(
    device_id: int,
    request: ApplyCommandsRequest,
    db: Session = Depends(get_db)
):
    """
    Apply configuration commands to a device with commit-confirmed

    Args:
        device_id: Device ID
        request: Request body with commands, description, and user_email
    """
    from worker.tasks.config_change import apply_config_commands as apply_task

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if not request.commands or len(request.commands) == 0:
        raise HTTPException(status_code=400, detail="No commands provided")

    # Queue config change task
    task = apply_task.delay(
        device_id=device_id,
        commands=request.commands,
        description=request.description,
        user_email=request.user_email
    )

    return {
        "message": "Configuration change queued",
        "device_id": device_id,
        "hostname": device.hostname,
        "task_id": task.id,
        "description": request.description,
        "num_commands": len(request.commands)
    }


class ChatRequest(BaseModel):
    message: str
    include_config: bool = False
    include_health: bool = False


class GenerateConfigRequest(BaseModel):
    task_description: str
    include_current_config: bool = False


@router.post("/{device_id}/chat")
def chat_with_ai(
    device_id: int,
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    """
    Interactive AI chat about device configuration and issues
    Returns a streaming response

    Args:
        device_id: Device ID
        request: Chat request with message and context options
    """
    from app.services.ai_service import AIService
    from app.services import GitService
    from app.models import ConfigBackup

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Build device context
    device_context = {
        'hostname': device.hostname,
        'model': device.model,
        'junos_version': device.junos_version
    }

    # Include configuration if requested
    if request.include_config:
        try:
            # Get latest backup
            backup = db.query(ConfigBackup).filter(
                ConfigBackup.device_id == device_id
            ).order_by(ConfigBackup.backed_up_at.desc()).first()

            if backup:
                git_service = GitService()
                config_text = git_service.get_config_at_commit(device, backup.git_commit_sha)
                device_context['config_snippet'] = config_text[:5000]  # First 5000 chars
        except Exception as e:
            # Continue without config if it fails
            pass

    # Include health status if requested
    if request.include_health:
        from app.models import Job

        # Get latest health check job
        health_job = db.query(Job).filter(
            Job.device_id == device_id,
            Job.job_type == 'health_check',
            Job.status == 'success'
        ).order_by(Job.finished_at.desc()).first()

        if health_job and health_job.result_json:
            device_context['health_status'] = f"Storage: {health_job.result_json.get('storage', 'N/A')}, Tunnels: {health_job.result_json.get('tunnels', 'N/A')}"

    # Create streaming generator
    def generate():
        ai_service = AIService()
        for chunk in ai_service.chat_stream(request.message, device_context):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/plain"
    )


@router.post("/{device_id}/generate-config")
def generate_configuration(
    device_id: int,
    request: GenerateConfigRequest,
    db: Session = Depends(get_db)
):
    """
    AI-powered configuration generation

    Args:
        device_id: Device ID
        request: Generation request with task description
    """
    from app.services.ai_service import AIService
    from app.services import GitService
    from app.models import ConfigBackup

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Build device context
    device_context = {
        'hostname': device.hostname,
        'model': device.model,
        'junos_version': device.junos_version
    }

    # Include current config if requested
    if request.include_current_config:
        try:
            # Get latest backup
            backup = db.query(ConfigBackup).filter(
                ConfigBackup.device_id == device_id
            ).order_by(ConfigBackup.backed_up_at.desc()).first()

            if backup:
                git_service = GitService()
                config_text = git_service.get_config_at_commit(device, backup.git_commit_sha)
                device_context['current_config_snippet'] = config_text[:3000]
        except Exception:
            # Continue without config if it fails
            pass

    # Generate configuration
    ai_service = AIService()
    result = ai_service.generate_config(request.task_description, device_context)

    if not result.get('success'):
        raise HTTPException(
            status_code=500,
            detail=result.get('error', 'Configuration generation failed')
        )

    return {
        "success": True,
        "device_id": device.id,
        "hostname": device.hostname,
        "task_description": request.task_description,
        "generated_config": result['config']
    }


# ============================================================================
# UPTIME MONITORING ENDPOINTS
# ============================================================================

@router.get("/{device_id}/uptime/")
async def get_device_uptime(device_id: int, db: Session = Depends(get_db)):
    """
    Get uptime monitoring data from Uptime Robot for a device

    Args:
        device_id: Device ID

    Returns:
        dict: Uptime monitoring data including status, uptime ratios, response times
    """
    from app.services.uptimerobot_service import UptimeRobotService

    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    uptime_service = UptimeRobotService()

    if not uptime_service.enabled:
        return {
            "success": False,
            "error": "Uptime monitoring is not enabled"
        }

    uptime_data = await uptime_service.enrich_device_with_uptime(device.mgmt_ip)

    if not uptime_data:
        return {
            "success": False,
            "error": "No uptime monitor found for this device"
        }

    return {
        "success": True,
        "device_id": device.id,
        "hostname": device.hostname,
        "uptime": uptime_data
    }

