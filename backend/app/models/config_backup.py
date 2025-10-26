"""
Config Backup Model
Tracks configuration backups with Git versioning
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class ConfigBackup(Base):
    """Configuration backup record"""

    __tablename__ = "config_backups"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)

    # Backup info
    backed_up_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    size_bytes = Column(BigInteger)

    # Git info
    git_commit_sha = Column(String(40), index=True)
    git_commit_message = Column(String(500))

    # Metadata
    backup_type = Column(String(20), default="scheduled")  # scheduled, manual, pre_change, post_change
    triggered_by = Column(String(255))  # user email or "system"

    # Relationships
    device = relationship("Device", back_populates="backups")

    def __repr__(self):
        return f"<ConfigBackup(id={self.id}, device_id={self.device_id}, sha='{self.git_commit_sha[:8]}')>"
