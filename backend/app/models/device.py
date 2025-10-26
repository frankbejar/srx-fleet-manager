"""
Device Model
Represents a Juniper SRX firewall device
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Device(Base):
    """Juniper SRX Device"""

    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String(255), nullable=False)
    mgmt_ip = Column(String(45), unique=True, nullable=False, index=True)

    # Location
    site = Column(String(100))
    city = Column(String(100))
    state = Column(String(10))
    region = Column(String(50), index=True)
    entity = Column(String(100))

    # Device Info
    model = Column(String(50))
    serial_number = Column(String(50), unique=True)
    junos_version = Column(String(50))

    # Network Info
    subnet = Column(String(50))
    wan_type = Column(String(50))
    isp_provider = Column(String(100))
    account_number = Column(String(100))

    # Contact
    it_technician = Column(String(100))

    # Credentials (override defaults)
    ssh_user = Column(String(100))
    ssh_password = Column(String(255))  # Should be encrypted in production
    ssh_port = Column(Integer, default=22)

    # Status
    enabled = Column(Boolean, default=True, index=True)
    last_seen_at = Column(DateTime)
    last_backup_at = Column(DateTime)

    # Metadata
    tags = Column(Text)  # JSON string
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    jobs = relationship("Job", back_populates="device", cascade="all, delete-orphan")
    backups = relationship("ConfigBackup", back_populates="device", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Device(id={self.id}, hostname='{self.hostname}', ip='{self.mgmt_ip}')>"
