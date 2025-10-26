"""
Devices API Router
Endpoints for device management
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

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

    return {
        'total_devices': total,
        'enabled_devices': enabled,
        'disabled_devices': total - enabled,
        'by_region': {region: count for region, count in by_region if region},
        'by_wan_type': {wan: count for wan, count in by_wan if wan}
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
