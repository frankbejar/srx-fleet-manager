"""
Device Schemas
Pydantic models for device API
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class DeviceBase(BaseModel):
    """Base device fields"""
    hostname: str
    mgmt_ip: str
    site: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    region: Optional[str] = None
    entity: Optional[str] = None
    model: Optional[str] = None
    junos_version: Optional[str] = None
    subnet: Optional[str] = None
    wan_type: Optional[str] = None
    isp_provider: Optional[str] = None
    it_technician: Optional[str] = None
    enabled: bool = True


class DeviceCreate(DeviceBase):
    """Schema for creating a device"""
    ssh_user: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_port: Optional[int] = 22


class DeviceUpdate(BaseModel):
    """Schema for updating a device"""
    hostname: Optional[str] = None
    site: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    region: Optional[str] = None
    entity: Optional[str] = None
    model: Optional[str] = None
    junos_version: Optional[str] = None
    subnet: Optional[str] = None
    wan_type: Optional[str] = None
    isp_provider: Optional[str] = None
    it_technician: Optional[str] = None
    enabled: Optional[bool] = None
    notes: Optional[str] = None
    ssh_user: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_port: Optional[int] = None


class DeviceResponse(DeviceBase):
    """Schema for device response"""
    id: int
    serial_number: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    last_backup_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() + 'Z' if v else None
        }
