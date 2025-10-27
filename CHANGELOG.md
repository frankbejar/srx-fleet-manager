# Changelog

All notable changes to the SRX Fleet Manager project will be documented in this file.

## [1.0.0-alpha] - 2025-01-27

### Added

#### Dashboard Redesign
- Implemented modern dashboard with improved visual hierarchy
- Added prominent alert banner at top for devices not reporting (shows when >0 devices haven't checked in via UptimeRobot within last hour)
- Converted "Recent Activities" to horizontal stats bar with running/pending/success/failed/total job counts
- Redesigned charts section with side-by-side grid layout for JunOS Distribution and Devices by Location
- Added interactive device chips in alert banner with hostname, region, and time since last check
- Added "View All Devices →" link in alert banner that navigates to filtered device list

#### Device Filtering
- Implemented URL-based filtering on devices page with `?status=not_reporting` parameter
- Added visual badge indicator when "not_reporting" filter is active
- Integrated filter with clearFilters functionality
- Added localStorage persistence for filter state
- Devices not reporting filter shows devices that haven't been seen in over 1 hour

#### Health Monitoring
- UptimeRobot integration for external device monitoring
- Disabled local health check scheduling in favor of external monitoring
- Added `stale_devices` endpoint showing devices not reporting within last hour
- Database cleanup removed 3,967 automated health check job records

#### UI Improvements
- Updated dashboard with modern CSS styling including:
  - Alert banner with horizontal scrolling device chips
  - Horizontal stats bar with icons and dividers
  - Responsive charts grid layout
  - Improved color scheme and spacing
- Fixed dashboard component structure for better React rendering
- Updated API client timeout to 10 seconds with 5 max redirects
- Added axios request/response interceptors for debugging API calls

### Fixed

#### Performance Issues
- **Critical**: Fixed CORS blocking issue causing 15-second load times
  - Added `localhost:3001` to backend CORS allowed origins (frontend was on 3001, not 3000)
  - Restarted API container to apply CORS configuration
- **Critical**: Removed trailing slashes from all API endpoints causing HTTP 307 redirects
  - Updated devicesApi endpoints: `/api/devices/`, `/api/devices/stats/`, etc. → `/api/devices`, `/api/devices/stats`
  - Updated jobsApi endpoints similarly
  - Eliminated unnecessary redirects improving API response time
- Fixed Next.js webpack cache corruption with `.next` directory cleanup

#### Backend
- Updated CORS middleware in `/backend/app/main.py` to allow both `localhost:3000` and `localhost:3001`
- Verified CORS headers present in API responses with curl testing

#### Frontend
- Fixed API client in `/ui/src/lib/api.ts` by removing all trailing slashes
- Added comprehensive axios interceptors for request/response logging
- Updated devices page to properly handle `statusFilter` from URL parameters
- Fixed clearFilters function to include statusFilter reset

### Changed
- Updated README.md with:
  - Current device count: 77 Juniper SRX firewalls
  - Status line: "Fully operational with modern dashboard UI, automated monitoring, and Git-versioned backups"
  - Added "Implemented Features" section documenting completed work
  - Updated development roadmap to reflect Phase 1 & 2 completion status
  - Corrected UI access URL from localhost:3000 to localhost:3001
- Environment configuration: `HEALTH_CHECK_SCHEDULE_ENABLED=false` to disable automated health checks

### Technical Details
- Dashboard page: `/ui/src/pages/index.tsx` (complete redesign, ~1079 lines)
- Devices page: `/ui/src/pages/devices.tsx` (added statusFilter support)
- API client: `/ui/src/lib/api.ts` (removed trailing slashes, added interceptors)
- Backend: `/backend/app/main.py` (CORS configuration update)

## Infrastructure

### Current Stack
- **Frontend**: Next.js 14 with TypeScript
- **Backend**: FastAPI (Python 3.11)
- **Database**: PostgreSQL 15
- **Queue**: Celery + Redis
- **Monitoring**: UptimeRobot (external)
- **Version Control**: Git (for config backups)

### Deployment
- Docker Compose multi-container setup
- All services bound to localhost (127.0.0.1)
- No external exposure by default
- 77 devices across 10 regions (AZ, NM, TX, NV, CO, IL, NY)

---

## Legend
- `Added` - New features
- `Changed` - Changes in existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Vulnerability fixes
