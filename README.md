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
   http://localhost:3000
   ```

5. **Import your devices:**
   ```bash
   python scripts/import_devices.py --csv /path/to/inventory.csv
   ```

---

## 📊 Current Status

**Version**: 1.0.0-alpha
**Devices Supported**: 76 Juniper SRX firewalls
**Regions**: 10 (AZ, NM, TX, NV, CO, IL, NY)

---

## 📖 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](http://localhost:8000/docs) (when running)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [SharePoint Integration](docs/SHAREPOINT.md)

---

## 🔧 Development Roadmap

### Phase 1 - Foundation (Current)
- [x] Project structure
- [x] Docker environment
- [ ] Database schema
- [ ] Device import
- [ ] Basic UI
- [ ] Config backup with Git versioning

### Phase 2 - Operations
- [ ] Health monitoring dashboard
- [ ] Tunnel status viewer
- [ ] Tunnel nudge with guardrails
- [ ] JSNAPy validation tests

### Phase 3 - Change Management
- [ ] Jinja2 config templates
- [ ] Dry-run workflow
- [ ] Commit-confirmed changes
- [ ] Approval workflow

### Phase 4 - Maintenance
- [ ] Firmware upgrade workflow
- [ ] Pre-flight checks
- [ ] Staged rollout
- [ ] Post-upgrade validation

### Phase 5 - Documentation
- [ ] Status report generation
- [ ] SharePoint upload
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
