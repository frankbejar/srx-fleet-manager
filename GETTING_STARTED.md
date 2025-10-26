# Getting Started - SRX Fleet Manager

## 🚀 Quick Start (5 Minutes)

### Step 1: Clone and Setup

```bash
cd /Users/frankbejar/Documents/GitHub
git clone https://github.com/frankbejar/srx-fleet-manager.git
cd srx-fleet-manager
```

### Step 2: Configure Environment

```bash
cp .env.sample .env
# Edit .env with your settings (minimal config works for testing)
```

**Minimal .env for testing:**
```env
# Database
POSTGRES_USER=srx
POSTGRES_PASSWORD=srxpassword
POSTGRES_DB=srx_fleet

# SRX Credentials
SRX_DEFAULT_USER=admin
SRX_DEFAULT_PASSWORD=your-password-here

# Other defaults are fine for local testing
```

### Step 3: Start the Stack

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- FastAPI backend (port 8000)
- Next.js UI (port 3000)
- Celery worker
- Celery beat (scheduler)

### Step 4: Import Your 76 Devices

```bash
# Option 1: From old juniper-srx-manager CSV
python3 scripts/import_devices.py

# Option 2: Specify CSV path
python3 scripts/import_devices.py /path/to/srx_inventory.csv
```

### Step 5: Access the Application

**Web UI:** http://localhost:3000
**API Docs:** http://localhost:8000/docs

---

## 📊 What You Can Do Now

### View Fleet Dashboard
- Total devices, regions, job stats
- http://localhost:3000

### Manage Devices
- List all 76 SRX devices
- Filter by region
- View device details
- http://localhost:3000/devices

### Trigger Operations

**Via UI:**
- Click "Backup" to queue config backup
- Click "Health Check" to check device status

**Via API:**
```bash
# Backup a device
curl -X POST http://localhost:8000/api/devices/1/backup

# Health check
curl -X POST http://localhost:8000/api/devices/1/health-check

# View jobs
curl http://localhost:8000/api/jobs
```

### Monitor Jobs
- Real-time job tracking
- Success/failure status
- http://localhost:3000/jobs

---

## 🔧 System Architecture

```
┌─────────────┐
│   Next.js   │  ← Web UI (React)
│  Port 3000  │
└──────┬──────┘
       │
┌──────▼──────┐
│   FastAPI   │  ← REST API
│  Port 8000  │
└──────┬──────┘
       │
┌──────▼──────────┐
│ Celery Workers  │  ← Background Jobs
│   + Beat        │
└──────┬──────────┘
       │
┌──────▼──────────────┐
│  PostgreSQL + Redis │  ← Data & Queue
└─────────────────────┘
       │
┌──────▼──────────┐
│  SRX Devices    │  ← Via SSH/PyEZ
│  (76 devices)   │
└─────────────────┘
```

---

## 🎯 Common Operations

### Backup All Devices (Nightly)
Automatic via Celery Beat at 2 AM daily.

**Manual trigger:**
```python
from worker.tasks.backup import backup_all_devices
backup_all_devices.delay()
```

### Backup by Region
```bash
curl -X POST http://localhost:8000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"region": "AZ Central"}'
```

### View Config History
```bash
# Get device backups
curl http://localhost:8000/api/devices/1/backups
```

### View Logs
```bash
# API logs
docker-compose logs -f api

# Worker logs
docker-compose logs -f worker

# All logs
docker-compose logs -f
```

---

## 🗄️ Database Access

```bash
# Connect to PostgreSQL
docker-compose exec db psql -U srx -d srx_fleet

# View devices
SELECT id, hostname, mgmt_ip, region FROM devices;

# View jobs
SELECT id, job_type, status, queued_at FROM jobs ORDER BY queued_at DESC LIMIT 10;

# View backups
SELECT id, device_id, backed_up_at, git_commit_sha FROM config_backups ORDER BY backed_up_at DESC LIMIT 10;
```

---

## 📁 Config Backups Location

Configs are stored with Git versioning:
```
storage/configs/
├── AZ Central/
│   ├── Phoenix Site/
│   │   └── srx-device-1.conf
│   └── Mesa Site/
│       └── srx-device-2.conf
├── NM Southern/
│   └── ...
└── .git/  ← Full version history
```

**View diff:**
```bash
cd storage/configs
git log --oneline
git diff HEAD~1 HEAD
```

---

## 🔍 Troubleshooting

### Services Not Starting
```bash
# Check status
docker-compose ps

# View logs
docker-compose logs

# Restart
docker-compose restart
```

### Can't Connect to Devices
1. Check credentials in .env
2. Verify network access to device IPs
3. Test manually: `ssh admin@device-ip`

### Database Errors
```bash
# Reset database
docker-compose down -v
docker-compose up -d
python3 scripts/import_devices.py
```

### Worker Not Processing Jobs
```bash
# Check worker logs
docker-compose logs worker

# Restart worker
docker-compose restart worker
```

---

## 📚 Next Steps

1. **Configure Maintenance Windows** - Edit device records
2. **Setup SharePoint Integration** - For status reports
3. **Add More Devices** - Via API or import script
4. **Configure Scheduled Tasks** - Modify celery_app.py
5. **Setup Authentication** - Enable OIDC or local auth

---

## 🆘 Support

- **Documentation:** docs/ folder
- **API Docs:** http://localhost:8000/docs
- **GitHub Issues:** https://github.com/frankbejar/srx-fleet-manager/issues

---

**You're ready to manage your 76 SRX firewalls!** 🔥
