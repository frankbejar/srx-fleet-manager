# SRX Fleet Manager - Deployment Guide

## Overview

This guide covers deploying SRX Fleet Manager in both development and production environments. The platform is designed to run locally on a single server with Docker Compose, requiring no cloud infrastructure.

## Prerequisites

### Required Software
- **Docker**: Version 20.x or later
- **Docker Compose**: Version 2.x or later
- **Git**: For cloning repository and config versioning
- **Python**: 3.11+ (for optional management scripts)
- **Node.js**: 18+ (for frontend development only)

### System Requirements

**Minimum**:
- CPU: 4 cores
- RAM: 8 GB
- Disk: 50 GB (for configs, backups, logs)
- OS: Linux, macOS, or Windows with WSL2

**Recommended (Production)**:
- CPU: 8 cores
- RAM: 16 GB
- Disk: 100 GB SSD
- OS: Ubuntu 22.04 LTS or RHEL 9

### Network Requirements
- SSH/NETCONF access to SRX devices (port 830)
- Outbound HTTPS for UptimeRobot API (optional)
- Outbound HTTPS for Microsoft Graph API (optional)
- No inbound ports required (localhost-only by default)

## Quick Start (Development)

### 1. Clone Repository

```bash
git clone https://github.com/frankbejar/srx-fleet-manager.git
cd srx-fleet-manager
```

### 2. Configure Environment

```bash
cp .env.sample .env
nano .env
```

**Minimum Configuration**:
```bash
# Database
POSTGRES_USER=srx
POSTGRES_PASSWORD=change_me_in_production
POSTGRES_DB=srx_fleet

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# API
API_HOST=0.0.0.0
API_PORT=8000

# Device Credentials (defaults for all devices)
DEFAULT_SSH_USER=admin
DEFAULT_SSH_PASSWORD=your_device_password

# Monitoring
BACKUP_SCHEDULE_ENABLED=true
HEALTH_CHECK_SCHEDULE_ENABLED=false

# Logging
LOG_LEVEL=INFO
```

### 3. Start Services

```bash
docker compose up -d
```

**Services Started**:
- `srx-fleet-db` (PostgreSQL) - localhost:5432
- `srx-fleet-redis` (Redis) - localhost:6379
- `srx-fleet-api` (FastAPI) - localhost:8000
- `srx-fleet-worker` (Celery) - background tasks
- `srx-fleet-ui` (Next.js) - localhost:3001

### 4. Verify Deployment

```bash
# Check service health
docker compose ps

# Check API health
curl http://localhost:8000/health

# Check UI
curl http://localhost:3001

# Check logs
docker compose logs -f api
docker compose logs -f worker
```

### 5. Import Devices

**Option A: Manual via UI**
- Navigate to http://localhost:3001/devices
- Click "Add Device"
- Fill in hostname, IP, credentials
- Click "Save"

**Option B: Bulk Import via Script** (future)
```bash
python scripts/import_devices.py --csv devices.csv
```

CSV Format:
```csv
hostname,mgmt_ip,site,city,state,region,entity
srx-az-001,10.1.1.1,Phoenix DC,Phoenix,AZ,Southwest,Corp
srx-tx-001,10.2.1.1,Dallas DC,Dallas,TX,Southwest,Corp
```

## Production Deployment

### Architecture

```
Internet
   |
   | SSH Tunnel / VPN
   |
┌──▼──────────────────────────────────────────────┐
│  Production Server (Ubuntu 22.04)               │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │  Docker Compose Stack                   │   │
│  │                                          │   │
│  │  - PostgreSQL (persistent volume)       │   │
│  │  - Redis (ephemeral)                    │   │
│  │  - FastAPI (localhost:8000)             │   │
│  │  - Celery Workers (background)          │   │
│  │  - Next.js (localhost:3001)             │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
│  /opt/srx-fleet-manager/                        │
│  ├── backups/ (Git repo)                        │
│  ├── logs/                                      │
│  └── postgres_data/                             │
└──────────────────────────────────────────────────┘
         |
         | SSH/NETCONF (port 830)
         |
    SRX Firewalls
```

### Step-by-Step Production Setup

#### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y git docker.io docker-compose python3-pip

# Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Create application directory
sudo mkdir -p /opt/srx-fleet-manager
sudo chown $USER:$USER /opt/srx-fleet-manager
cd /opt/srx-fleet-manager
```

#### 2. Clone and Configure

```bash
# Clone repository
git clone https://github.com/frankbejar/srx-fleet-manager.git .

# Create production environment file
cp .env.sample .env.production
nano .env.production
```

**Production Environment**:
```bash
# Database - Use strong passwords
POSTGRES_USER=srx_prod
POSTGRES_PASSWORD=<strong_random_password>
POSTGRES_DB=srx_fleet

# API Configuration
API_HOST=127.0.0.1  # Localhost only for security
API_PORT=8000
DEBUG=false

# Device Credentials
DEFAULT_SSH_USER=<device_admin_user>
DEFAULT_SSH_PASSWORD=<encrypted_or_vault_reference>

# Monitoring
BACKUP_SCHEDULE_ENABLED=true
HEALTH_CHECK_SCHEDULE_ENABLED=false
UPTIME_ROBOT_API_KEY=<your_api_key>

# Microsoft Graph API (optional)
GRAPH_TENANT_ID=<tenant_id>
GRAPH_CLIENT_ID=<client_id>
GRAPH_CLIENT_SECRET=<client_secret>

# Logging
LOG_LEVEL=INFO

# Security
SECRET_KEY=<generate_strong_secret>
ALLOWED_HOSTS=localhost,127.0.0.1
```

**Generate Strong Passwords**:
```bash
# Generate random password
openssl rand -base64 32

# Generate secret key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

#### 3. Configure Docker Compose for Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    container_name: srx-fleet-db-prod
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - /opt/srx-fleet-manager/postgres_data:/var/lib/postgresql/data
    restart: always
    networks:
      - srx-fleet-network

  redis:
    image: redis:7-alpine
    container_name: srx-fleet-redis-prod
    restart: always
    networks:
      - srx-fleet-network

  api:
    build: ./backend
    container_name: srx-fleet-api-prod
    env_file:
      - .env.production
    depends_on:
      - db
      - redis
    ports:
      - "127.0.0.1:8000:8000"
    volumes:
      - /opt/srx-fleet-manager/backups:/app/backups
      - /opt/srx-fleet-manager/logs:/app/logs
    restart: always
    networks:
      - srx-fleet-network

  worker:
    build: ./backend
    container_name: srx-fleet-worker-prod
    command: celery -A app.celery_app worker --loglevel=info
    env_file:
      - .env.production
    depends_on:
      - db
      - redis
    volumes:
      - /opt/srx-fleet-manager/backups:/app/backups
      - /opt/srx-fleet-manager/logs:/app/logs
    restart: always
    networks:
      - srx-fleet-network

  ui:
    build: ./ui
    container_name: srx-fleet-ui-prod
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    ports:
      - "127.0.0.1:3001:3000"
    restart: always
    networks:
      - srx-fleet-network

networks:
  srx-fleet-network:
    driver: bridge

volumes:
  postgres_data:
```

#### 4. Build and Deploy

```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d

# Verify all services running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f
```

#### 5. Initialize Database

```bash
# Database tables are created automatically on first API startup
# Verify with:
docker compose -f docker-compose.prod.yml logs api | grep "Database tables created"
```

#### 6. Setup Systemd Service (Optional)

Create `/etc/systemd/system/srx-fleet-manager.service`:

```ini
[Unit]
Description=SRX Fleet Manager
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/srx-fleet-manager
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable srx-fleet-manager
sudo systemctl start srx-fleet-manager
sudo systemctl status srx-fleet-manager
```

### 7. Configure Backups

**Database Backups**:
```bash
# Create backup script
cat > /opt/srx-fleet-manager/backup-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR=/opt/srx-fleet-manager/db-backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
docker exec srx-fleet-db-prod pg_dump -U srx_prod srx_fleet | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x /opt/srx-fleet-manager/backup-db.sh

# Add to crontab (daily at 1 AM)
echo "0 1 * * * /opt/srx-fleet-manager/backup-db.sh" | crontab -
```

**Config Backups**:
- Already versioned in Git at `/opt/srx-fleet-manager/backups/git_repo/`
- Optionally push to remote Git repository:

```bash
cd /opt/srx-fleet-manager/backups/git_repo
git remote add origin git@github.com:yourorg/srx-configs-backup.git
git push -u origin main
```

### 8. Setup Firewall (Optional)

```bash
# Allow SSH only
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw enable
```

### 9. Access via SSH Tunnel

For remote access without exposing ports:

```bash
# From your workstation
ssh -L 3001:localhost:3001 -L 8000:localhost:8000 user@production-server

# Access UI at http://localhost:3001
# Access API docs at http://localhost:8000/docs
```

## Monitoring and Maintenance

### Health Checks

```bash
# Check service status
docker compose ps

# Check API health
curl http://localhost:8000/health

# Check Celery worker status
docker exec srx-fleet-worker-prod celery -A app.celery_app inspect active
```

### Log Management

```bash
# View logs
docker compose logs -f api
docker compose logs -f worker
docker compose logs --tail=100 db

# Configure log rotation in docker-compose.yml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Database Maintenance

```bash
# Vacuum and analyze (monthly)
docker exec srx-fleet-db-prod psql -U srx_prod -d srx_fleet -c "VACUUM ANALYZE;"

# Check database size
docker exec srx-fleet-db-prod psql -U srx_prod -d srx_fleet -c "SELECT pg_size_pretty(pg_database_size('srx_fleet'));"
```

### Updating the Application

```bash
cd /opt/srx-fleet-manager

# Pull latest code
git pull origin main

# Rebuild images
docker compose -f docker-compose.prod.yml build

# Restart services
docker compose -f docker-compose.prod.yml up -d

# Verify
docker compose -f docker-compose.prod.yml ps
```

## Troubleshooting

### Issue: Services Won't Start

```bash
# Check Docker daemon
sudo systemctl status docker

# Check logs
docker compose logs

# Check disk space
df -h

# Check memory
free -h
```

### Issue: Database Connection Errors

```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Check database logs
docker logs srx-fleet-db-prod

# Test connection
docker exec srx-fleet-db-prod psql -U srx_prod -d srx_fleet -c "SELECT 1;"
```

### Issue: Worker Not Processing Jobs

```bash
# Check worker logs
docker logs srx-fleet-worker-prod

# Check Redis connection
docker exec srx-fleet-redis-prod redis-cli ping

# Restart worker
docker compose restart worker
```

### Issue: Cannot Connect to SRX Devices

```bash
# Test NETCONF connectivity from worker container
docker exec srx-fleet-worker-prod ssh -p 830 admin@device-ip

# Check firewall rules
# Ensure worker container can reach device management IPs

# Verify credentials in .env
```

## Security Best Practices

1. **Change Default Passwords**: Update all passwords in `.env.production`
2. **Restrict Network Access**: Bind services to 127.0.0.1 only
3. **Use SSH Tunnels**: For remote access instead of exposing ports
4. **Encrypt Credentials**: Use Vault or encrypted environment variables
5. **Regular Backups**: Database and config backups to offsite location
6. **Update Regularly**: Keep Docker images and dependencies updated
7. **Monitor Logs**: Watch for suspicious activity
8. **Least Privilege**: Run containers as non-root users (future enhancement)

## Scaling Considerations

### Horizontal Scaling (Multiple Workers)

```yaml
services:
  worker:
    deploy:
      replicas: 3
```

### Vertical Scaling (Resource Limits)

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Disaster Recovery

### Backup Checklist
- [ ] PostgreSQL database (daily)
- [ ] `/opt/srx-fleet-manager/backups/` directory
- [ ] `.env.production` file (encrypted)
- [ ] Docker compose configuration files

### Recovery Procedure

1. **Restore Code**:
   ```bash
   git clone https://github.com/frankbejar/srx-fleet-manager.git /opt/srx-fleet-manager
   cd /opt/srx-fleet-manager
   ```

2. **Restore Environment**:
   ```bash
   cp /path/to/backup/.env.production .env.production
   ```

3. **Restore Database**:
   ```bash
   gunzip -c /path/to/backup/db_backup_YYYYMMDD.sql.gz | \
   docker exec -i srx-fleet-db-prod psql -U srx_prod srx_fleet
   ```

4. **Restore Configs**:
   ```bash
   cp -r /path/to/backup/backups /opt/srx-fleet-manager/
   ```

5. **Start Services**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

## Support

For issues or questions:
- Check logs: `docker compose logs`
- Review documentation in `/docs`
- Open GitHub issue: https://github.com/frankbejar/srx-fleet-manager/issues

---

**Last Updated**: 2025-01-27
**Version**: 1.0.0-alpha
