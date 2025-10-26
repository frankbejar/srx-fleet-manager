"""
Job Model
Represents an operation/task performed on devices
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Job(Base):
    """Job/Operation record"""

    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String(50), nullable=False, index=True)  # backup, health, change, upgrade, tunnel_reset
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)

    # Status tracking
    status = Column(String(20), nullable=False, default="pending", index=True)  # pending, running, success, failed, cancelled
    queued_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)

    # User tracking
    user_email = Column(String(255))
    user_name = Column(String(255))

    # Job details
    params_json = Column(JSON)  # Job parameters
    result_json = Column(JSON)  # Job results
    error_text = Column(Text)

    # Celery task ID
    task_id = Column(String(255), unique=True, index=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    device = relationship("Device", back_populates="jobs")

    def __repr__(self):
        return f"<Job(id={self.id}, type='{self.job_type}', status='{self.status}')>"

    @property
    def duration(self):
        """Calculate job duration in seconds"""
        if self.started_at and self.finished_at:
            return (self.finished_at - self.started_at).total_seconds()
        return None
