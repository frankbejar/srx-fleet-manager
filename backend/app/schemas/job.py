"""
Job Schemas
Pydantic models for job API
"""

from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class JobResponse(BaseModel):
    """Schema for job response"""
    id: int
    job_type: str
    device_id: int
    status: str
    task_id: Optional[str] = None
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    user_email: Optional[str] = None
    result_json: Optional[Dict[str, Any]] = None
    error_text: Optional[str] = None

    class Config:
        from_attributes = True


class JobStats(BaseModel):
    """Job statistics"""
    total: int
    pending: int
    running: int
    success: int
    failed: int
