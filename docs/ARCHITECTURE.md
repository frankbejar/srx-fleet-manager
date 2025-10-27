# SRX Fleet Manager - Architecture

## Overview

SRX Fleet Manager is a locally-hosted, enterprise-grade platform for managing Juniper SRX firewall fleets. The architecture follows a modern microservices pattern with containerized components communicating via REST APIs and message queues.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                            │
│                     (http://localhost:3001)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/REST
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Frontend (Next.js)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Pages: Dashboard, Devices, Device Detail, Jobs         │  │
│  │  Components: Charts, Tables, Forms, Alerts              │  │
│  │  API Client: Axios with interceptors                    │  │
│  │  State: React Hooks, localStorage                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ REST API calls
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Backend (FastAPI)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Routers: /devices, /jobs, /backups                     │  │
│  │  Services: device_service, job_service, backup_service   │  │
│  │  Middleware: CORS, Exception Handlers                    │  │
│  │  Database: SQLAlchemy ORM                                │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────┘
                             │
                   ┌─────────┼─────────┐
                   │         │         │
                   │         │         │
┌──────────────────▼──┐  ┌───▼────┐  ┌▼─────────────────────────┐
│   PostgreSQL DB     │  │ Redis  │  │   Celery Workers         │
│                     │  │        │  │                          │
│  Tables:            │  │ Queue  │  │  Tasks:                  │
│  - devices          │  │ Cache  │  │  - backup_device_task    │
│  - jobs             │  │        │  │  - health_check_task     │
│  - backups          │  │        │  │  - analyze_config_task   │
│  - config_analyses  │  │        │  │  - apply_commands_task   │
│                     │  │        │  │                          │
└─────────────────────┘  └────────┘  └───────────┬──────────────┘
                                                  │
                                                  │ SSH/NETCONF
                                                  │
                                     ┌────────────▼─────────────┐
                                     │  Juniper SRX Firewalls   │
                                     │                          │
                                     │  77 devices across       │
                                     │  10 regions              │
                                     └──────────────────────────┘
```

## Component Details

### Frontend (Next.js + React + TypeScript)

**Location**: `/ui`

**Technology**:
- Next.js 14 with App Router
- React 18 with TypeScript
- Styled JSX for component-scoped CSS
- Recharts for data visualization
- Axios for API communication

**Key Pages**:
- `/` - Dashboard with alerts, stats, and charts
- `/devices` - Device list with filtering and sorting
- `/devices/[id]` - Device detail with tabs (Overview, Config, Jobs, etc.)
- `/jobs` - Job queue monitoring

**Features**:
- Real-time data updates via API polling
- URL-based state management for filters
- localStorage persistence for user preferences
- Responsive design with modern UI components
- Alert banner for critical device issues
- Interactive charts and tables

**API Client** (`/ui/src/lib/api.ts`):
```typescript
- devicesApi: list, get, create, stats, regions, backup, analyze, etc.
- jobsApi: list, get, stats
- Axios interceptors for debugging
- Timeout: 10 seconds
- CORS-enabled for localhost:3001
```

### Backend (FastAPI + Python)

**Location**: `/backend`

**Technology**:
- FastAPI (Python 3.11)
- SQLAlchemy ORM
- Pydantic for data validation
- Structured logging with structlog
- CORS middleware for frontend access

**API Routes**:

**Devices** (`/api/devices`):
- `GET /api/devices` - List all devices with filters
- `GET /api/devices/{id}` - Get device details
- `POST /api/devices` - Create new device
- `PUT /api/devices/{id}` - Update device
- `DELETE /api/devices/{id}` - Delete device
- `GET /api/devices/stats` - Dashboard statistics
- `GET /api/devices/regions` - List regions
- `POST /api/devices/{id}/backup` - Trigger backup
- `POST /api/devices/{id}/health-check` - Run health check
- `POST /api/devices/{id}/analyze` - Analyze config
- `POST /api/devices/{id}/apply-commands` - Apply config changes
- `GET /api/devices/{id}/backups` - List device backups
- `GET /api/devices/{id}/jobs` - List device jobs
- `GET /api/devices/{id}/uptime` - Get UptimeRobot status

**Jobs** (`/api/jobs`):
- `GET /api/jobs` - List all jobs with filters
- `GET /api/jobs/{id}` - Get job details
- `GET /api/jobs/stats` - Job statistics

**Database Models**:
```python
Device:
  - id, hostname, mgmt_ip, site, city, state, region, entity
  - model, serial_number, junos_version
  - ssh credentials, enabled status
  - last_seen_at, last_backup_at
  - created_at, updated_at

Job:
  - id, job_type, device_id, status, task_id
  - queued_at, started_at, finished_at
  - user_email, result_json, error_text

Backup:
  - id, device_id, file_path, size_bytes
  - git_commit_sha, backup_type, triggered_by
  - backed_up_at

ConfigAnalysis:
  - id, device_id, backup_id
  - summary, severity, security_score, compliance_score
  - findings_json, analyzed_at
```

### Workers (Celery + Redis)

**Location**: `/backend/app/tasks`

**Technology**:
- Celery 5.x for distributed task queue
- Redis as message broker
- Nornir for multi-device automation
- Juniper PyEZ (jnpr.junos) for NETCONF

**Background Tasks**:

1. **backup_device_task**
   - Connects to device via NETCONF
   - Retrieves full configuration (XML)
   - Saves to `/backups/{hostname}/config_{timestamp}.xml`
   - Commits to Git with SHA tracking
   - Updates database with backup record

2. **health_check_task** (deprecated - using UptimeRobot)
   - Checks device reachability
   - Gathers system facts (model, version, uptime)
   - Updates last_seen_at timestamp

3. **analyze_config_task**
   - Reads backup configuration
   - Sends to AI service for security analysis
   - Generates security score, compliance score
   - Identifies findings by category/severity
   - Stores analysis in database

4. **apply_commands_task**
   - Loads candidate configuration
   - Validates syntax
   - Performs commit confirmed (auto-rollback)
   - Creates backup before/after
   - Tracks changes in job history

**Scheduled Tasks** (Celery Beat):
```python
# Configured in /backend/app/celery_app.py
backup_schedule:
  task: backup_all_devices
  schedule: crontab(hour=2, minute=0)  # 2:00 AM daily
  enabled: true  # Controlled by BACKUP_SCHEDULE_ENABLED env var

health_check_schedule:
  task: health_check_all_devices
  schedule: crontab(minute='*/5')  # Every 5 minutes
  enabled: false  # Disabled in favor of UptimeRobot
```

### Database (PostgreSQL)

**Location**: Docker container `srx-fleet-db`

**Configuration**:
- PostgreSQL 15
- Database: `srx_fleet`
- User: `srx`
- Persistent volume: `postgres_data`

**Schema Management**:
- SQLAlchemy ORM handles schema
- Auto-create tables on startup
- Migration strategy: Alembic (future)

### Message Queue (Redis)

**Location**: Docker container `srx-fleet-redis`

**Configuration**:
- Redis 7.x
- Port: 6379 (internal only)
- Used for Celery task queue and results backend

### External Integrations

**UptimeRobot**:
- External monitoring service
- Monitors device reachability via HTTPS/Ping
- API integration in backend (`/api/devices/{id}/uptime`)
- Replaces local health check polling
- Data includes: status, uptime %, response time, last down time

**Microsoft Graph API** (planned):
- SharePoint document upload
- Change report generation
- Authentication via Entra ID OIDC

### Configuration Management

**Git Version Control**:
- Location: `/backups/git_repo/`
- Automatic commits on each backup
- Commit message format: `Backup: {hostname} - {timestamp}`
- SHA tracking in backups table
- Enables diff viewing and rollback

**Environment Variables** (`.env`):
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

# Device Credentials (default)
DEFAULT_SSH_USER=cplc
DEFAULT_SSH_PASSWORD=<encrypted>

# Monitoring
UPTIME_ROBOT_API_KEY=<api_key>

# Features
BACKUP_SCHEDULE_ENABLED=true
HEALTH_CHECK_SCHEDULE_ENABLED=false

# Logging
LOG_LEVEL=INFO
```

## Data Flow

### Device Backup Flow
```
1. Celery Beat triggers backup_all_devices at 2:00 AM
2. For each enabled device:
   - Celery worker picks up backup_device_task
   - Worker updates job status to "running"
   - Nornir connects via NETCONF (PyEZ)
   - Retrieves running configuration
   - Saves to /backups/{hostname}/config_{timestamp}.xml
   - Git add + commit with SHA
   - Updates backups table with file_path, git_commit_sha
   - Updates devices table with last_backup_at
   - Worker updates job status to "success" with result_json
3. Frontend polls /api/jobs and shows updated status
```

### Device Monitoring Flow
```
1. UptimeRobot monitors devices externally (HTTP/Ping)
2. Frontend requests dashboard stats via /api/devices/stats
3. Backend queries:
   - Total devices: COUNT(*)
   - Enabled: WHERE enabled=true
   - Stale devices: WHERE last_seen_at < NOW() - INTERVAL '1 hour'
   - Backup coverage: COUNT(last_backup_at) / COUNT(*)
4. Backend queries UptimeRobot API for real-time status
5. Returns aggregated stats to frontend
6. Dashboard displays alert banner if stale_devices_count > 0
```

### Config Analysis Flow
```
1. User clicks "Analyze Config" on device detail page
2. Frontend calls POST /api/devices/{id}/analyze
3. Backend creates job record and enqueues analyze_config_task
4. Celery worker:
   - Retrieves latest backup or specified backup_id
   - Reads config XML
   - Sends to AI service with prompt
   - Parses response into structured findings
   - Calculates security_score and compliance_score
   - Stores ConfigAnalysis record
   - Updates job with result_json
5. Frontend polls job status and displays analysis when complete
```

### Config Change Flow
```
1. User enters commands on device detail page
2. Frontend calls POST /api/devices/{id}/apply-commands
3. Backend creates job and enqueues apply_commands_task
4. Celery worker:
   - Creates backup (pre-change)
   - Connects via NETCONF
   - Loads candidate config with commands
   - Runs commit check for syntax validation
   - Performs commit confirmed (10 minute timeout)
   - Waits for user confirmation or auto-rollback
   - Creates backup (post-change)
   - Updates job with success/failure
5. Frontend shows live job status and results
```

## Security Architecture

### Network Security
- All services bound to 127.0.0.1 (localhost only)
- No external exposure by default
- Production requires VPN/SSH tunnel
- CORS restricted to localhost:3000 and localhost:3001

### Authentication (future)
- Option 1: Local auth with PostgreSQL user/role tables
- Option 2: Entra ID OIDC (Microsoft 365) - no Azure infrastructure required

### Secrets Management
- Development: `.env` file (gitignored)
- Production: HashiCorp Vault (dev mode) or OS keyring
- Device credentials encrypted at rest (future)

### Audit Trail
- All changes tracked in jobs table
- User email captured for accountability
- Git commits provide config history
- Job results include before/after snapshots

## Scalability Considerations

### Current Capacity
- 77 devices managed
- Nightly backups complete in ~10 minutes
- API response time: <100ms for most endpoints
- Database size: ~50MB with full history

### Scaling Strategy
- **Horizontal**: Add more Celery workers for parallel tasks
- **Vertical**: Increase worker container resources
- **Database**: Connection pooling, read replicas
- **Caching**: Redis for frequently accessed data
- **Monitoring**: Prometheus + Grafana for metrics

### Performance Optimizations
- Removed trailing slashes to eliminate 307 redirects
- Added axios timeouts (10s) to prevent hanging requests
- CORS properly configured to avoid preflight delays
- Database indexes on hostname, region, last_seen_at
- Git shallow clones for faster backup operations

## Monitoring and Observability

### Logging
- Structured JSON logging via structlog
- Log levels: DEBUG, INFO, WARNING, ERROR
- Logs include: timestamp, level, message, context
- Docker logs accessible via `docker logs <container>`

### Health Checks
- Backend: `GET /health` returns service status
- Frontend: Port 3001 accessibility
- Database: Connection pool monitoring
- Redis: Celery worker heartbeat

### Metrics (future)
- Job success/failure rates
- Backup completion times
- API endpoint latency
- Device response times
- Worker queue depth

## Disaster Recovery

### Backup Strategy
- Git repository contains all device configs
- PostgreSQL data volume for database backups
- Docker volumes persist across restarts
- Recommended: Daily backup of `/backups` and `postgres_data` volume

### Recovery Procedures
1. **Config Recovery**: Git checkout specific SHA
2. **Database Recovery**: Restore postgres_data volume
3. **Full System**: Docker compose down + restore volumes + compose up

## Development Workflow

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development procedures.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment guide.

---

**Last Updated**: 2025-01-27
**Architecture Version**: 1.0.0-alpha
