"""
Jobs API Router
Endpoints for job/operation tracking
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from app.database import get_db
from app.models import Job
from app.schemas.job import JobResponse, JobStats

router = APIRouter()


@router.get("/", response_model=List[JobResponse])
def list_jobs(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    job_type: Optional[str] = None,
    device_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """List jobs with optional filtering"""
    query = db.query(Job)

    if status:
        query = query.filter(Job.status == status)

    if job_type:
        query = query.filter(Job.job_type == job_type)

    if device_id:
        query = query.filter(Job.device_id == device_id)

    jobs = query.order_by(Job.queued_at.desc()).offset(skip).limit(limit).all()
    return jobs


@router.get("/stats", response_model=JobStats)
def get_job_stats(db: Session = Depends(get_db)):
    """Get job statistics"""
    total = db.query(func.count(Job.id)).scalar()
    pending = db.query(func.count(Job.id)).filter(Job.status == 'pending').scalar()
    running = db.query(func.count(Job.id)).filter(Job.status == 'running').scalar()
    success = db.query(func.count(Job.id)).filter(Job.status == 'success').scalar()
    failed = db.query(func.count(Job.id)).filter(Job.status == 'failed').scalar()

    return {
        'total': total,
        'pending': pending,
        'running': running,
        'success': success,
        'failed': failed
    }


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    """Get a specific job"""
    job = db.query(Job).filter(Job.id == job_id).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@router.delete("/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    """Delete a job record"""
    job = db.query(Job).filter(Job.id == job_id).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    db.delete(job)
    db.commit()

    return {"message": "Job deleted successfully"}
