# SRX Fleet Manager

**Enterprise-grade Juniper SRX firewall fleet management platform**

A modern, locally-hosted network operations toolkit to centrally manage, monitor, and maintain 50+ Juniper SRX firewalls across multiple sites.

---

## 🎯 Purpose

Reduce manual effort, speed up routine maintenance, standardize change execution, and improve safety and auditability for firewall operations.

### Key Features

- **Fleet Monitoring** - Real-time health checks, tunnel status, version tracking
- **Config Management** - Automated backups with Git versioning and diffs
- **Safe Operations** - Commit-confirmed changes with auto-rollback
- **Change Validation** - JSNAPy pre/post checks for all changes
- **Audit Trail** - Complete job history and artifact tracking
- **Status Reports** - Generate and upload change documentation to SharePoint

---

## 🏗️ Architecture

### Technology Stack

- **Frontend**: Next.js (React) - Modern, responsive UI with real-time updates
- **Backend**: FastAPI - High-performance Python API
- **Workers**: Celery + Redis - Async job queue for background operations
- **Database**: PostgreSQL - Device inventory, jobs, audit trail
- **Automation**: Nornir + PyEZ + JSNAPy - Juniper-native automation
- **Versioning**: Git - Automatic config version control
- **Integration**: Microsoft Graph API - SharePoint status reports

### Local-First Design

Everything runs on your local machine or server:
- ✅ No Azure hosting required
- ✅ No cloud storage dependencies
- ✅ SharePoint only for report uploads
- ✅ Complete offline capability

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Git
- Network access to SRX devices (SSH/NETCONF)
- Microsoft 365 tenant (for SharePoint integration - optional)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/frankbejar/srx-fleet-manager.git
   cd srx-fleet-manager
   ```

2. **Configure environment:**
   ```bash
   cp .env.sample .env
   # Edit .env with your settings
   ```

3. **Start the platform:**
   ```bash
   docker-compose up -d
   ```

4. **Access the UI:**
   ```
   http://localhost:3001
   ```

5. **Import your devices:**
   ```bash
   python scripts/import_devices.py --csv /path/to/inventory.csv
   ```

---

## 📊 Current Status

**Version**: 1.0.0-alpha
**Devices Supported**: 77 Juniper SRX firewalls
**Regions**: 10 (AZ, NM, TX, NV, CO, IL, NY)
**Status**: Fully operational with modern dashboard UI, automated monitoring, and Git-versioned backups

### Implemented Features

✅ **Dashboard** - Modern redesigned UI with alert banner, horizontal stats, side-by-side charts
✅ **Device Management** - Full CRUD operations, filtering by status/region/version
✅ **Health Monitoring** - UptimeRobot integration for external monitoring (replaces local checks)
✅ **Config Backups** - Automated nightly backups with Git versioning
✅ **Job Queue** - Celery-based async job processing with real-time status
✅ **API** - FastAPI with CORS support for localhost:3000 and localhost:3001
✅ **Database** - PostgreSQL with device inventory and job history

---

## 📖 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](http://localhost:8000/docs) (when running)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [SharePoint Integration](docs/SHAREPOINT.md)

---

## 🔧 Development Roadmap

### Phase 1 - Foundation ✅ Complete
- [x] Project structure
- [x] Docker environment (PostgreSQL, Redis, Celery, FastAPI, Next.js)
- [x] Database schema (devices, jobs, backups, config_analyses)
- [x] Device import (77 SRX firewalls across 10 regions)
- [x] Modern dashboard UI with alerts, stats, and charts
- [x] Config backup with Git versioning (automated nightly)

### Phase 2 - Operations ✅ Complete
- [x] Health monitoring dashboard with UptimeRobot integration
- [x] Device filtering by status, region, version, last seen
- [x] Real-time job queue monitoring
- [ ] Tunnel status viewer (planned)
- [ ] Tunnel nudge with guardrails (planned)
- [ ] JSNAPy validation tests (planned)

### Phase 3 - Change Management (In Progress)
- [x] AI-powered config analysis with security scoring
- [x] Commit-confirmed changes with auto-rollback
- [ ] Jinja2 config templates (planned)
- [ ] Dry-run workflow (planned)
- [ ] Approval workflow (planned)

### Phase 4 - Maintenance (Planned)
- [x] Firmware version detection and inventory
- [ ] Firmware upgrade workflow with readiness checks
- [ ] Pre-flight validation
- [ ] Staged rollout
- [ ] Post-upgrade validation

### Phase 5 - Documentation & Reporting (Planned)
- [ ] Status report generation
- [ ] SharePoint upload integration
- [ ] Change history viewer

---

## 🔐 Security

### Authentication Options

1. **Local Auth** - Users/roles stored in PostgreSQL
2. **Entra ID OIDC** - Microsoft 365 integration (no Azure infra)

### Secrets Management

- Development: `.env` file
- Production: HashiCorp Vault (dev mode) or OS keyring

### Network Security

- All services bound to `127.0.0.1` (localhost only)
- No external exposure by default
- VPN/tunnel required for production deployment

---

## 📝 Configuration

### Environment Variables

See `.env.sample` for all configuration options:

- Database connection
- Redis configuration
- Device credentials
- SharePoint integration
- Authentication mode
- Logging levels

---

## 🤝 Contributing

This is a private project for network operations. For questions or issues:

1. Check documentation in `docs/`
2. Review API docs at http://localhost:8000/docs
3. Open an issue on GitHub

---

## 📄 License

Private and proprietary. All rights reserved.

---

## 👤 Author

**Frank Bejar**
- GitHub: [@frankbejar](https://github.com/frankbejar)

---

## 🙏 Acknowledgments

Built with:
- Juniper PyEZ - Juniper Networks automation library
- FastAPI - Modern Python web framework
- Next.js - React framework
- Nornir - Network automation framework

---

**Transform your SRX management from manual CLI work to automated, safe, auditable operations.** 🔥
