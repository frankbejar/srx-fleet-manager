/**
 * Homepage / Dashboard
 * Modern dashboard with Fleet Overview, Recent Activities, JunOS Distribution, and Location views
 */

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { devicesApi, jobsApi } from '../lib/api';

export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [jobStats, setJobStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [deviceStats, jobsStats] = await Promise.all([
          devicesApi.stats(),
          jobsApi.stats(),
        ]);
        setStats(deviceStats);
        setJobStats(jobsStats);
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Calculate max value for JunOS version bar chart
  const junosVersions = stats?.by_junos_version ? Object.entries(stats.by_junos_version) : [];
  const maxJunosCount = junosVersions.length > 0
    ? Math.max(...junosVersions.map(([_, count]: [string, any]) => count))
    : 1;

  // Calculate max value for location bar chart
  const regions = stats?.by_region ? Object.entries(stats.by_region) : [];
  const maxRegionCount = regions.length > 0
    ? Math.max(...regions.map(([_, count]: [string, any]) => count))
    : 1;

  // Determine backup health status
  const backupCoverage = stats?.backup_coverage_percent || 0;
  const backupStatus = backupCoverage >= 80 ? 'healthy' : backupCoverage >= 50 ? 'warning' : 'critical';

  return (
    <>
      <Head>
        <title>Dashboard - SRX Fleet Manager</title>
        <meta name="description" content="Enterprise SRX firewall fleet management dashboard" />
      </Head>

      <div className="container">
        <header className="page-header">
          <h1>Dashboard</h1>
          <p>Real-time fleet overview and system metrics</p>
        </header>

        {/* Critical Alert Banner - Devices Not Reporting */}
        {stats?.stale_devices_count > 0 && (
          <div className="alert-banner">
            <div className="alert-banner-header">
              <div className="alert-banner-title">
                <span className="alert-icon">⚠️</span>
                <h3>{stats.stale_devices_count} Device{stats.stale_devices_count !== 1 ? 's' : ''} Not Reporting</h3>
              </div>
              <Link href="/devices?status=not_reporting" className="alert-action-button">
                View All →
              </Link>
            </div>
            <p className="alert-banner-description">
              No check-in via UptimeRobot monitoring within the last hour
            </p>
            <div className="alert-devices-scroll">
              {stats.stale_devices.map((device: any) => (
                <Link
                  key={device.id}
                  href={`/devices/${device.id}`}
                  className="alert-device-chip"
                >
                  <div className="alert-device-info">
                    <span className="alert-device-name">{device.hostname}</span>
                    <span className="alert-device-region">{device.region}</span>
                  </div>
                  <span className="alert-device-time">
                    {device.minutes_since_last_check !== null ? (
                      `${Math.floor(device.minutes_since_last_check / 60)}h ${device.minutes_since_last_check % 60}m`
                    ) : (
                      'Never'
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Fleet Overview Section */}
        <section className="dashboard-section">
          <h2 className="section-title">Fleet Overview</h2>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-icon">📡</span>
                <span className="kpi-label">Total Devices</span>
              </div>
              <div className="kpi-value">{stats?.total_devices || 0}</div>
              <div className="kpi-meta">
                <span className="kpi-detail success">{stats?.enabled_devices || 0} enabled</span>
                {stats?.disabled_devices > 0 && (
                  <span className="kpi-detail muted"> • {stats.disabled_devices} disabled</span>
                )}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-icon">🔄</span>
                <span className="kpi-label">Backup Coverage</span>
              </div>
              <div className="kpi-value">
                {backupCoverage.toFixed(1)}%
                <span className={`health-indicator ${backupStatus}`}></span>
              </div>
              <div className="kpi-meta">
                <span className="kpi-detail">{stats?.devices_with_recent_backup || 0} backed up (7d)</span>
                {stats?.devices_never_backed_up > 0 && (
                  <span className="kpi-detail warning"> • {stats.devices_never_backed_up} never backed up</span>
                )}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-icon">🌍</span>
                <span className="kpi-label">Locations</span>
              </div>
              <div className="kpi-value">
                {stats?.by_region ? Object.keys(stats.by_region).length : 0}
              </div>
              <div className="kpi-meta">
                <span className="kpi-detail">Active deployment regions</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-icon">🖥️</span>
                <span className="kpi-label">Device Models</span>
              </div>
              <div className="kpi-value">
                {stats?.by_model ? Object.keys(stats.by_model).length : 0}
              </div>
              <div className="kpi-meta">
                <span className="kpi-detail">Hardware platforms</span>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Activities - Horizontal Stats Bar */}
        <div className="stats-bar">
          <div className="stats-bar-header">
            <h3>Recent Activities</h3>
            <Link href="/jobs" className="stats-bar-link">
              View All Jobs →
            </Link>
          </div>
          <div className="stats-bar-items">
            <div className="stats-bar-item">
              <span className="stats-bar-icon running">⚡</span>
              <div className="stats-bar-content">
                <div className="stats-bar-value">{jobStats?.running || 0}</div>
                <div className="stats-bar-label">Running</div>
              </div>
            </div>
            <div className="stats-bar-divider"></div>
            <div className="stats-bar-item">
              <span className="stats-bar-icon pending">⏳</span>
              <div className="stats-bar-content">
                <div className="stats-bar-value">{jobStats?.pending || 0}</div>
                <div className="stats-bar-label">Pending</div>
              </div>
            </div>
            <div className="stats-bar-divider"></div>
            <div className="stats-bar-item">
              <span className="stats-bar-icon success">✓</span>
              <div className="stats-bar-content">
                <div className="stats-bar-value">{jobStats?.success || 0}</div>
                <div className="stats-bar-label">Successful</div>
              </div>
            </div>
            <div className="stats-bar-divider"></div>
            <div className="stats-bar-item">
              <span className="stats-bar-icon failed">✗</span>
              <div className="stats-bar-content">
                <div className="stats-bar-value">{jobStats?.failed || 0}</div>
                <div className="stats-bar-label">Failed</div>
              </div>
            </div>
            <div className="stats-bar-divider"></div>
            <div className="stats-bar-item">
              <span className="stats-bar-icon stats">📊</span>
              <div className="stats-bar-content">
                <div className="stats-bar-value">
                  {jobStats?.total > 0
                    ? Math.round((jobStats.success / jobStats.total) * 100)
                    : 0}%
                </div>
                <div className="stats-bar-label">Success Rate</div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid - JunOS Distribution & Location */}
        {(junosVersions.length > 0 || regions.length > 0) && (
          <div className="charts-grid">
            {/* JunOS OS Distribution Chart */}
            {junosVersions.length > 0 && (
              <section className="dashboard-section">
                <h2 className="section-title">JunOS OS Distribution</h2>
                <div className="chart-container">
                  <div className="bar-chart">
                    {junosVersions
                      .sort((a: any, b: any) => b[1] - a[1])
                      .map(([version, count]: [string, any]) => (
                        <div key={version} className="bar-item">
                          <div className="bar-label">{version}</div>
                          <div className="bar-wrapper">
                            <div
                              className="bar-fill"
                              style={{ width: `${(count / maxJunosCount) * 100}%` }}
                            >
                              <span className="bar-value">{count}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </section>
            )}

            {/* Devices by Location Chart */}
            {regions.length > 0 && (
              <section className="dashboard-section">
                <h2 className="section-title">Devices by Location</h2>
                <div className="chart-container">
                  <div className="bar-chart">
                    {regions
                      .sort((a: any, b: any) => b[1] - a[1])
                      .map(([region, count]: [string, any]) => (
                        <Link
                          key={region}
                          href={`/devices?region=${encodeURIComponent(region)}`}
                          className="bar-item clickable"
                        >
                          <div className="bar-label">{region}</div>
                          <div className="bar-wrapper">
                            <div
                              className="bar-fill location"
                              style={{ width: `${(count / maxRegionCount) * 100}%` }}
                            >
                              <span className="bar-value">{count} device{count !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </Link>
                      ))
                    }
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0;
        }

        /* Loading State */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-20);
          gap: var(--space-4);
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-secondary);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-state p {
          color: var(--text-secondary);
          font-size: var(--text-base);
        }

        /* Page Header */
        .page-header {
          margin-bottom: var(--space-6);
        }

        .page-header h1 {
          font-size: var(--text-3xl);
          font-weight: 700;
          margin: 0 0 var(--space-2) 0;
          color: var(--text-primary);
        }

        .page-header p {
          margin: 0;
          color: var(--text-secondary);
          font-size: var(--text-base);
        }

        /* Dashboard Sections */
        .dashboard-section {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
          margin-bottom: var(--space-6);
          box-shadow: var(--shadow-sm);
        }

        .section-title {
          margin: 0 0 var(--space-5) 0;
          color: var(--text-primary);
          font-size: var(--text-xl);
          font-weight: 600;
          padding-bottom: var(--space-3);
          border-bottom: 2px solid var(--border-secondary);
        }

        .section-footer {
          margin-top: var(--space-5);
          padding-top: var(--space-4);
          border-top: 1px solid var(--border-secondary);
          text-align: center;
        }

        .link-button {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          color: var(--accent-primary);
          text-decoration: none;
          font-weight: 500;
          font-size: var(--text-sm);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }

        .link-button:hover {
          background: var(--bg-tertiary);
          color: var(--accent-hover);
        }

        /* Fleet Overview - KPI Cards */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: var(--space-4);
        }

        /* Alert Banner */
        .alert-banner {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(251, 191, 36, 0.05));
          border: 2px solid var(--status-warning);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          margin-bottom: var(--space-6);
          box-shadow: 0 4px 12px rgba(251, 191, 36, 0.15);
        }

        .alert-banner-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-3);
        }

        .alert-banner-title {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .alert-banner-title h3 {
          margin: 0;
          font-size: var(--text-xl);
          font-weight: 700;
          color: var(--text-primary);
        }

        .alert-icon {
          font-size: var(--text-3xl);
        }

        .alert-action-button {
          padding: var(--space-2) var(--space-4);
          background: var(--status-warning);
          color: white;
          text-decoration: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: var(--text-sm);
          transition: all var(--transition-fast);
        }

        .alert-action-button:hover {
          background: #f59e0b;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(251, 191, 36, 0.3);
        }

        .alert-banner-description {
          margin: 0 0 var(--space-4) 0;
          color: var(--text-secondary);
          font-size: var(--text-sm);
        }

        .alert-devices-scroll {
          display: flex;
          gap: var(--space-3);
          overflow-x: auto;
          padding-bottom: var(--space-2);
          scrollbar-width: thin;
          scrollbar-color: var(--status-warning) var(--bg-tertiary);
        }

        .alert-devices-scroll::-webkit-scrollbar {
          height: 6px;
        }

        .alert-devices-scroll::-webkit-scrollbar-track {
          background: var(--bg-tertiary);
          border-radius: var(--radius-full);
        }

        .alert-devices-scroll::-webkit-scrollbar-thumb {
          background: var(--status-warning);
          border-radius: var(--radius-full);
        }

        .alert-device-chip {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-4);
          padding: var(--space-3) var(--space-4);
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-md);
          text-decoration: none;
          color: inherit;
          min-width: 280px;
          transition: all var(--transition-fast);
        }

        .alert-device-chip:hover {
          background: var(--bg-tertiary);
          border-color: var(--status-warning);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .alert-device-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .alert-device-name {
          font-weight: 600;
          color: var(--text-primary);
          font-size: var(--text-sm);
        }

        .alert-device-region {
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }

        .alert-device-time {
          padding: var(--space-1) var(--space-3);
          background: rgba(251, 191, 36, 0.15);
          color: var(--status-warning);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          font-weight: 600;
          white-space: nowrap;
        }

        /* Stats Bar */
        .stats-bar {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          margin-bottom: var(--space-6);
          box-shadow: var(--shadow-sm);
        }

        .stats-bar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-4);
          padding-bottom: var(--space-3);
          border-bottom: 2px solid var(--border-secondary);
        }

        .stats-bar-header h3 {
          margin: 0;
          font-size: var(--text-xl);
          font-weight: 600;
          color: var(--text-primary);
        }

        .stats-bar-link {
          color: var(--accent-primary);
          text-decoration: none;
          font-weight: 500;
          font-size: var(--text-sm);
          transition: color var(--transition-fast);
        }

        .stats-bar-link:hover {
          color: var(--accent-hover);
        }

        .stats-bar-items {
          display: flex;
          align-items: center;
          justify-content: space-around;
          gap: var(--space-4);
        }

        .stats-bar-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .stats-bar-icon {
          font-size: var(--text-2xl);
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }

        .stats-bar-icon.running {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .stats-bar-icon.pending {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
        }

        .stats-bar-icon.success {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }

        .stats-bar-icon.failed {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .stats-bar-icon.stats {
          background: rgba(168, 85, 247, 0.1);
          color: #a855f7;
        }

        .stats-bar-content {
          display: flex;
          flex-direction: column;
        }

        .stats-bar-value {
          font-size: var(--text-2xl);
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1;
        }

        .stats-bar-label {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          font-weight: 500;
          margin-top: var(--space-1);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stats-bar-divider {
          width: 1px;
          height: 48px;
          background: var(--border-secondary);
        }

        /* Charts Grid */
        .charts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-6);
        }

        .kpi-card {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          transition: all var(--transition-fast);
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          border-color: var(--border-primary);
        }

        .kpi-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
        }

        .kpi-icon {
          font-size: var(--text-2xl);
          opacity: 0.9;
        }

        .kpi-label {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .kpi-value {
          font-size: var(--text-4xl);
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: var(--space-2);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .health-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          display: inline-block;
          margin-left: var(--space-2);
        }

        .health-indicator.healthy {
          background: var(--status-success);
          box-shadow: 0 0 8px var(--status-success);
        }

        .health-indicator.warning {
          background: var(--status-warning);
          box-shadow: 0 0 8px var(--status-warning);
        }

        .health-indicator.critical {
          background: var(--status-error);
          box-shadow: 0 0 8px var(--status-error);
        }

        .kpi-meta {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1);
          font-size: var(--text-sm);
        }

        .kpi-detail {
          color: var(--text-secondary);
        }

        .kpi-detail.success {
          color: var(--status-success);
        }

        .kpi-detail.warning {
          color: var(--status-warning);
        }

        .kpi-detail.muted {
          color: var(--text-tertiary);
        }

        /* Recent Activities */
        .activity-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--space-4);
        }

        .activity-card {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          transition: all var(--transition-fast);
        }

        .activity-card.wide {
          grid-column: span 2;
        }

        .activity-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          border-color: var(--border-primary);
        }

        .activity-stat {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .activity-icon {
          font-size: var(--text-3xl);
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }

        .activity-icon.running {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .activity-icon.pending {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
        }

        .activity-icon.success {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }

        .activity-icon.failed {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .activity-icon.stats {
          background: rgba(168, 85, 247, 0.1);
          color: #a855f7;
        }

        .activity-value {
          font-size: var(--text-3xl);
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1;
        }

        .activity-label {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          font-weight: 500;
          margin-top: var(--space-1);
        }

        .activity-subtext {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-top: var(--space-1);
        }

        /* Stale Devices Alert Section */
        .alert-section {
          border-left: 4px solid var(--status-warning);
          background: rgba(251, 191, 36, 0.05);
        }

        .section-header-with-badge {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-4);
        }

        .alert-badge {
          display: inline-flex;
          align-items: center;
          padding: var(--space-2) var(--space-4);
          background: rgba(251, 191, 36, 0.2);
          color: var(--status-warning);
          border: 1px solid var(--status-warning);
          border-radius: var(--radius-full);
          font-size: var(--text-sm);
          font-weight: 600;
        }

        .section-description {
          color: var(--text-secondary);
          font-size: var(--text-sm);
          margin-bottom: var(--space-4);
          padding: 0;
        }

        .stale-devices-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .stale-device-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-md);
          text-decoration: none;
          color: inherit;
          transition: all var(--transition-fast);
        }

        .stale-device-item:hover {
          background: var(--bg-tertiary);
          border-color: var(--status-warning);
          transform: translateX(4px);
        }

        .stale-device-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .stale-device-name {
          font-weight: 600;
          color: var(--text-primary);
          font-size: var(--text-sm);
        }

        .stale-device-region {
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }

        .stale-device-status {
          display: flex;
          align-items: center;
        }

        .stale-time {
          display: inline-flex;
          align-items: center;
          padding: var(--space-1) var(--space-3);
          background: rgba(251, 191, 36, 0.1);
          color: var(--status-warning);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          font-weight: 600;
        }

        .stale-time.never {
          background: rgba(239, 68, 68, 0.1);
          color: var(--status-error);
          border-color: rgba(239, 68, 68, 0.3);
        }

        /* Bar Charts */
        .chart-container {
          padding: var(--space-2) 0;
        }

        .bar-chart {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .bar-item {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }

        .bar-item.clickable {
          text-decoration: none;
          color: inherit;
          cursor: pointer;
        }

        .bar-item.clickable:hover {
          background: var(--bg-tertiary);
          transform: translateX(4px);
        }

        .bar-label {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-primary);
          min-width: 140px;
          flex-shrink: 0;
        }

        .bar-wrapper {
          flex: 1;
          height: 32px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-secondary);
          overflow: hidden;
          position: relative;
        }

        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0 var(--space-3);
          transition: width 0.6s ease;
          min-width: 60px;
          position: relative;
        }

        .bar-fill.location {
          background: linear-gradient(90deg, #667eea, #764ba2);
        }

        .bar-value {
          font-size: var(--text-xs);
          font-weight: 600;
          color: white;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          white-space: nowrap;
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .charts-grid {
            grid-template-columns: 1fr;
          }

          .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .stats-bar-items {
            flex-wrap: wrap;
            justify-content: flex-start;
          }

          .stats-bar-divider {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .dashboard-section {
            padding: var(--space-4);
          }

          .alert-banner {
            padding: var(--space-4);
          }

          .alert-banner-header {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--space-3);
          }

          .alert-device-chip {
            min-width: 240px;
          }

          .stats-bar {
            padding: var(--space-4);
          }

          .stats-bar-header {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--space-2);
          }

          .stats-bar-items {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: var(--space-4);
          }

          .stats-bar-item {
            flex-direction: column;
            align-items: flex-start;
          }

          .kpi-grid {
            grid-template-columns: 1fr;
          }

          .bar-label {
            min-width: 100px;
            font-size: var(--text-xs);
          }

          .bar-wrapper {
            height: 28px;
          }

          .kpi-value {
            font-size: var(--text-3xl);
          }

          .stats-bar-value {
            font-size: var(--text-xl);
          }
        }
      `}</style>
    </>
  );
}
