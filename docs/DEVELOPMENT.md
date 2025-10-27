# SRX Fleet Manager - Development Guide

## Overview

This guide covers local development setup, coding standards, testing procedures, and contribution workflows for the SRX Fleet Manager project.

## Development Environment Setup

### Prerequisites

- **Docker Desktop**: 4.x or later (includes Docker Compose)
- **Git**: Latest version
- **Node.js**: 18.x or later (for frontend development)
- **Python**: 3.11+ (for backend development)
- **VS Code** (recommended) with extensions:
  - Python
  - Pylance
  - ESLint
  - TypeScript and JavaScript Language Features
  - Docker

### Initial Setup

#### 1. Clone Repository

```bash
git clone https://github.com/frankbejar/srx-fleet-manager.git
cd srx-fleet-manager
```

#### 2. Configure Environment

```bash
cp .env.sample .env
```

Edit `.env` with your development settings:

```bash
# Database
POSTGRES_USER=srx
POSTGRES_PASSWORD=srxpassword
POSTGRES_DB=srx_fleet

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# API
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=true

# Device Credentials (use test devices)
DEFAULT_SSH_USER=admin
DEFAULT_SSH_PASSWORD=test_password

# Features
BACKUP_SCHEDULE_ENABLED=true
HEALTH_CHECK_SCHEDULE_ENABLED=false

# Logging
LOG_LEVEL=DEBUG
```

#### 3. Start Development Stack

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check service status
docker compose ps
```

**Services**:
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- FastAPI: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`
- Next.js: `http://localhost:3001`

#### 4. Verify Installation

```bash
# Test API
curl http://localhost:8000/health

# Test database connection
docker exec srx-fleet-db psql -U srx -d srx_fleet -c "SELECT 1;"

# Test Redis
docker exec srx-fleet-redis redis-cli ping
```

## Project Structure

```
srx-fleet-manager/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── settings.py     # Configuration management
│   │   ├── database.py     # Database connection and models
│   │   ├── routers/        # API route handlers
│   │   │   ├── devices.py  # Device endpoints
│   │   │   └── jobs.py     # Job endpoints
│   │   ├── services/       # Business logic
│   │   │   ├── device_service.py
│   │   │   ├── job_service.py
│   │   │   └── backup_service.py
│   │   ├── tasks/          # Celery tasks
│   │   │   ├── backup_tasks.py
│   │   │   ├── health_check_tasks.py
│   │   │   └── config_tasks.py
│   │   └── celery_app.py   # Celery configuration
│   ├── Dockerfile
│   └── requirements.txt
│
├── ui/                      # Next.js frontend
│   ├── src/
│   │   ├── pages/          # Next.js pages
│   │   │   ├── index.tsx   # Dashboard
│   │   │   ├── devices.tsx # Device list
│   │   │   ├── devices/
│   │   │   │   └── [id].tsx  # Device detail
│   │   │   └── jobs.tsx    # Job list
│   │   ├── components/     # React components
│   │   │   ├── DeviceCard.tsx
│   │   │   ├── JobTable.tsx
│   │   │   └── Charts.tsx
│   │   └── lib/            # Utilities
│   │       └── api.ts      # API client
│   ├── public/             # Static assets
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── DEVELOPMENT.md
│
├── scripts/                 # Utility scripts
│   └── import_devices.py
│
├── docker-compose.yml       # Docker Compose configuration
├── .env.sample             # Environment template
├── README.md               # Project overview
└── CHANGELOG.md            # Version history
```

## Backend Development

### Running Backend Locally (Without Docker)

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql://srx:srxpassword@localhost:5432/srx_fleet
export REDIS_URL=redis://localhost:6379

# Run API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# In another terminal, run Celery worker
celery -A app.celery_app worker --loglevel=debug

# In another terminal, run Celery beat (scheduler)
celery -A app.celery_app beat --loglevel=info
```

### Backend Code Style

**Python Standards**:
- Follow PEP 8
- Use type hints
- Maximum line length: 100 characters
- Use Black for formatting: `black app/`
- Use isort for imports: `isort app/`
- Use flake8 for linting: `flake8 app/`

**Example**:
```python
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import device_service

router = APIRouter()


@router.get("/api/devices", response_model=List[Device])
async def list_devices(
    region: Optional[str] = None,
    enabled: Optional[bool] = None,
    db: Session = Depends(get_db)
) -> List[Device]:
    """List all devices with optional filters."""
    devices = device_service.list_devices(db, region=region, enabled=enabled)
    return devices
```

### Adding New API Endpoints

1. **Define route in router** (`app/routers/devices.py`):
```python
@router.post("/api/devices/{device_id}/reboot")
async def reboot_device(device_id: int, db: Session = Depends(get_db)):
    """Reboot a device."""
    device = device_service.get_device(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Enqueue background task
    from app.tasks.device_tasks import reboot_device_task
    task = reboot_device_task.delay(device_id)

    # Create job record
    job = job_service.create_job(db, device_id, "reboot", task.id)

    return {"job_id": job.id, "task_id": task.id}
```

2. **Create background task** (`app/tasks/device_tasks.py`):
```python
from app.celery_app import celery_app
from app.database import SessionLocal
from nornir import InitNornir
from nornir_pyez.plugins.tasks import pyez_rpc

@celery_app.task(bind=True)
def reboot_device_task(self, device_id: int):
    """Reboot device via RPC."""
    db = SessionLocal()
    try:
        device = db.query(Device).filter(Device.id == device_id).first()

        # Initialize Nornir
        nr = InitNornir(...)

        # Execute reboot RPC
        result = nr.run(task=pyez_rpc, func="reboot")

        return {"success": True, "output": result}
    except Exception as e:
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise
    finally:
        db.close()
```

3. **Update API client** (`ui/src/lib/api.ts`):
```typescript
export const devicesApi = {
  // ... existing methods

  reboot: async (id: number) => {
    const { data } = await api.post(`/api/devices/${id}/reboot`);
    return data;
  },
};
```

### Database Migrations (Future)

```bash
# Install Alembic
pip install alembic

# Initialize Alembic
alembic init alembic

# Create migration
alembic revision --autogenerate -m "Add new_column to devices"

# Apply migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Testing Backend

```bash
# Install test dependencies
pip install pytest pytest-cov pytest-asyncio httpx

# Run tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test
pytest tests/test_devices.py::test_list_devices
```

**Example Test** (`tests/test_devices.py`):
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_list_devices():
    response = client.get("/api/devices")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_device_not_found():
    response = client.get("/api/devices/99999")
    assert response.status_code == 404
```

## Frontend Development

### Running Frontend Locally

```bash
cd ui

# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Access at `http://localhost:3001`

### Frontend Code Style

**TypeScript/React Standards**:
- Use TypeScript for all files
- Use functional components with hooks
- Follow Airbnb JavaScript Style Guide
- Use ESLint: `npm run lint`
- Use Prettier for formatting

**Example Component**:
```typescript
import React, { useState, useEffect } from 'react';
import { devicesApi, Device } from '@/lib/api';

interface DeviceListProps {
  region?: string;
}

export const DeviceList: React.FC<DeviceListProps> = ({ region }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const data = await devicesApi.list({ region });
        setDevices(data);
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, [region]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {devices.map(device => (
        <div key={device.id}>{device.hostname}</div>
      ))}
    </div>
  );
};
```

### Adding New Pages

1. **Create page** (`ui/src/pages/reports.tsx`):
```typescript
import React from 'react';
import Head from 'next/head';

export default function Reports() {
  return (
    <>
      <Head>
        <title>Reports - SRX Fleet Manager</title>
      </Head>
      <main>
        <h1>Reports</h1>
        {/* Page content */}
      </main>
    </>
  );
}
```

2. **Add navigation** (in layout or header component)

### Styling

**Styled JSX** (component-scoped):
```tsx
<div className="card">
  <h2>{title}</h2>
  <style jsx>{`
    .card {
      padding: 1rem;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
    }
  `}</style>
</div>
```

**Global Styles** (`ui/src/styles/globals.css`)

### Testing Frontend

```bash
# Install test dependencies
npm install --save-dev @testing-library/react @testing-library/jest-dom jest

# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

## Git Workflow

### Branch Strategy

```
main (production-ready)
  ├─ feature/dashboard-redesign
  ├─ feature/firmware-upgrade
  ├─ bugfix/cors-issue
  └─ hotfix/security-patch
```

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Example**:
```
feat(dashboard): add alert banner for devices not reporting

- Add full-width alert banner at top of dashboard
- Display devices with no check-in within last hour
- Add "View All" link with status filter
- Implement horizontal scrolling for device chips

Closes #42
```

### Contribution Workflow

```bash
# Create feature branch
git checkout -b feature/my-new-feature

# Make changes and commit
git add .
git commit -m "feat(api): add device reboot endpoint"

# Push to remote
git push origin feature/my-new-feature

# Create pull request on GitHub

# After review and approval, merge to main
```

## Debugging

### Backend Debugging

**VS Code** (`.vscode/launch.json`):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000"
      ],
      "jinja": true,
      "justMyCode": false
    }
  ]
}
```

**Logging**:
```python
import structlog
logger = structlog.get_logger()

logger.info("Device backup started", device_id=device.id, hostname=device.hostname)
logger.error("Backup failed", device_id=device.id, error=str(e))
```

### Frontend Debugging

**Browser DevTools**:
- Console: API errors, state changes
- Network: API requests/responses
- React DevTools: Component hierarchy and props

**Console Logging**:
```typescript
console.log('API Request:', config.method?.toUpperCase(), config.url);
console.error('API Error:', error.message, error.config?.url);
```

### Docker Debugging

```bash
# View logs
docker compose logs -f api
docker compose logs -f worker

# Execute commands in container
docker exec -it srx-fleet-api bash
docker exec -it srx-fleet-worker bash

# Inspect container
docker inspect srx-fleet-api

# Check resource usage
docker stats
```

## Performance Optimization

### Backend

- Use database connection pooling
- Add indexes on frequently queried columns
- Cache frequently accessed data in Redis
- Use async/await for I/O operations
- Implement pagination for large result sets

### Frontend

- Implement data caching with SWR or React Query
- Use React.memo for expensive components
- Lazy load routes with Next.js dynamic imports
- Optimize images with next/image
- Minimize bundle size

## Common Development Tasks

### Add New Device Model Support

1. Update device table schema if needed
2. Add model detection in device_service
3. Update frontend device detail page
4. Add model-specific automation logic

### Implement New Job Type

1. Create task in `backend/app/tasks/`
2. Add job type to database enum
3. Create API endpoint to trigger job
4. Add frontend UI for job creation
5. Update job detail page to display results

### Update Dependencies

```bash
# Backend
pip install --upgrade -r requirements.txt
pip freeze > requirements.txt

# Frontend
npm update
npm audit fix
```

### Clean Development Environment

```bash
# Stop all containers
docker compose down

# Remove volumes (WARNING: deletes database)
docker compose down -v

# Remove images
docker compose down --rmi all

# Clean build cache
docker system prune -a
```

## Resources

### Juniper Documentation
- [PyEZ Developer Guide](https://www.juniper.net/documentation/us/en/software/junos-pyez/junos-pyez-developer/index.html)
- [NETCONF Reference](https://www.juniper.net/documentation/us/en/software/junos/netconf/index.html)
- [JunOS XML API](https://www.juniper.net/documentation/us/en/software/junos/automation-scripting/topics/topic-map/junos-xml-api.html)

### Framework Documentation
- [FastAPI](https://fastapi.tiangolo.com/)
- [Next.js](https://nextjs.org/docs)
- [Celery](https://docs.celeryq.dev/)
- [SQLAlchemy](https://docs.sqlalchemy.org/)
- [Nornir](https://nornir.readthedocs.io/)

### Useful Tools
- [Postman](https://www.postman.com/) - API testing
- [DBeaver](https://dbeaver.io/) - Database GUI
- [RedisInsight](https://redis.com/redis-enterprise/redis-insight/) - Redis GUI

---

**Last Updated**: 2025-01-27
**Version**: 1.0.0-alpha
