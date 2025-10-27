/**
 * Devices List Page
 */

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { devicesApi, Device } from '../lib/api';

type SortField = 'hostname' | 'region' | 'junos_version' | 'last_seen_at';
type SortDirection = 'asc' | 'desc';

export default function Devices() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<Device[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uptimeData, setUptimeData] = useState<Record<number, any>>({});

  // Filter states
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [hostnameFilter, setHostnameFilter] = useState<string>('');
  const [versionFilter, setVersionFilter] = useState<string>('');
  const [lastSeenFilter, setLastSeenFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Sort states
  const [sortField, setSortField] = useState<SortField>('hostname');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Add device form state
  const [newDevice, setNewDevice] = useState({
    hostname: '',
    mgmt_ip: '',
    ssh_user: '',
    ssh_password: '',
    ssh_port: 22,
    region: '',
    site: '',
    city: '',
    state: '',
    entity: '',
    enabled: true,
  });

  // Load filters from URL on mount
  useEffect(() => {
    const { region, hostname, version, lastSeen, status, sortBy, sortDir } = router.query;

    if (region && typeof region === 'string') setRegionFilter(region);
    if (hostname && typeof hostname === 'string') setHostnameFilter(hostname);
    if (version && typeof version === 'string') setVersionFilter(version);
    if (lastSeen && typeof lastSeen === 'string') setLastSeenFilter(lastSeen);
    if (status && typeof status === 'string') setStatusFilter(status);
    if (sortBy && typeof sortBy === 'string') setSortField(sortBy as SortField);
    if (sortDir && typeof sortDir === 'string') setSortDirection(sortDir as SortDirection);

    // Load from localStorage if no URL params
    if (!region && !hostname && !version && !lastSeen && !status && !sortBy) {
      const saved = localStorage.getItem('deviceFilters');
      if (saved) {
        const filters = JSON.parse(saved);
        setRegionFilter(filters.region || '');
        setHostnameFilter(filters.hostname || '');
        setVersionFilter(filters.version || '');
        setLastSeenFilter(filters.lastSeen || '');
        setStatusFilter(filters.status || '');
        setSortField(filters.sortField || 'hostname');
        setSortDirection(filters.sortDirection || 'asc');
      }
    }
  }, [router.query]);

  // Update URL when filters change
  useEffect(() => {
    const query: any = {};
    if (regionFilter) query.region = regionFilter;
    if (hostnameFilter) query.hostname = hostnameFilter;
    if (statusFilter) query.status = statusFilter;
    if (versionFilter) query.version = versionFilter;
    if (lastSeenFilter) query.lastSeen = lastSeenFilter;
    if (sortField !== 'hostname') query.sortBy = sortField;
    if (sortDirection !== 'asc') query.sortDir = sortDirection;

    router.replace({ pathname: '/devices', query }, undefined, { shallow: true });

    // Save to localStorage
    localStorage.setItem('deviceFilters', JSON.stringify({
      region: regionFilter,
      hostname: hostnameFilter,
      version: versionFilter,
      lastSeen: lastSeenFilter,
      status: statusFilter,
      sortField,
      sortDirection
    }));
  }, [regionFilter, hostnameFilter, versionFilter, lastSeenFilter, statusFilter, sortField, sortDirection]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [devicesData, regionsData] = await Promise.all([
        devicesApi.list(),
        devicesApi.regions(),
      ]);
      setDevices(devicesData);
      setRegions(regionsData);

      // Extract unique versions
      const uniqueVersions = [...new Set(devicesData.map(d => d.junos_version).filter(Boolean))].sort();
      setVersions(uniqueVersions as string[]);

      // Load uptime data for all devices in background
      loadUptimeData(devicesData);
    } catch (error) {
      console.error('Error loading devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUptimeData = async (deviceList: Device[]) => {
    // Fetch uptime data for each device asynchronously
    deviceList.forEach(async (device) => {
      try {
        const uptime = await devicesApi.getUptime(device.id);
        if (uptime.success && uptime.uptime) {
          setUptimeData(prev => ({
            ...prev,
            [device.id]: uptime.uptime
          }));
        }
      } catch (error) {
        // Silently fail - not all devices may have uptime monitors
      }
    });
  };

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...devices];

    // Apply filters
    if (regionFilter) {
      filtered = filtered.filter(d => d.region === regionFilter);
    }
    if (hostnameFilter) {
      filtered = filtered.filter(d =>
        d.hostname.toLowerCase().includes(hostnameFilter.toLowerCase())
      );
    }
    if (versionFilter) {
      filtered = filtered.filter(d => d.junos_version === versionFilter);
    }
    if (statusFilter === 'not_reporting') {
      // Filter devices that haven't been seen in over 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      filtered = filtered.filter(d => {
        if (!d.last_seen_at) return true; // Never seen
        return new Date(d.last_seen_at) < oneHourAgo;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle null/undefined
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      // Convert dates to timestamps
      if (sortField === 'last_seen_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      // String comparison
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    setFilteredDevices(filtered);
  }, [devices, regionFilter, hostnameFilter, versionFilter, statusFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const clearFilters = () => {
    setRegionFilter('');
    setHostnameFilter('');
    setVersionFilter('');
    setStatusFilter('');
    setSortField('hostname');
    setSortDirection('asc');
  };

  const handleBackup = async (id: number, hostname: string) => {
    if (confirm(`Start backup for ${hostname}?`)) {
      try {
        await devicesApi.backup(id);
        alert(`Backup queued for ${hostname}`);
      } catch (error) {
        alert('Error queuing backup');
      }
    }
  };

  const handleHealthCheck = async (id: number, hostname: string) => {
    if (confirm(`Run health check on ${hostname}?`)) {
      try {
        await devicesApi.healthCheck(id);
        alert(`Health check queued for ${hostname}`);
      } catch (error) {
        alert('Error queuing health check');
      }
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await devicesApi.create(newDevice);
      alert(`Device ${newDevice.hostname} created successfully!`);

      // Reset form
      setNewDevice({
        hostname: '',
        mgmt_ip: '',
        ssh_user: '',
        ssh_password: '',
        ssh_port: 22,
        region: '',
        site: '',
        city: '',
        state: '',
        entity: '',
        enabled: true,
      });

      // Close modal and reload data
      setShowAddModal(false);
      loadData();
    } catch (error: any) {
      alert(`Error creating device: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading devices...</div>;
  }

  return (
    <>
      <Head>
        <title>Devices - SRX Fleet Manager</title>
      </Head>

      <div className="container">
        <header className="page-header">
          <div>
            <h1>SRX Devices</h1>
            <p>
              Showing {filteredDevices.length} of {devices.length} device(s)
              {statusFilter && (
                <span className="badge badge-warning" style={{ marginLeft: '0.5rem' }}>
                  Not Reporting
                </span>
              )}
              {(regionFilter || hostnameFilter || versionFilter || statusFilter) && (
                <>
                  {' '}
                  <button className="button-link" onClick={clearFilters}>
                    Clear Filters
                  </button>
                </>
              )}
            </p>
          </div>
          <button className="button button-primary" onClick={() => setShowAddModal(true)}>
            + Add Device
          </button>
        </header>

        <div className="filters">
          <div className="filter-grid">
            <label>
              Hostname:
              <input
                type="text"
                placeholder="Search hostname..."
                value={hostnameFilter}
                onChange={(e) => setHostnameFilter(e.target.value)}
              />
            </label>

            <label>
              Region:
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
              >
                <option value="">All Regions</option>
                {regions.map((r) => (
                  <option key={r.region} value={r.region}>
                    {r.region} ({r.count})
                  </option>
                ))}
              </select>
            </label>

            <label>
              JunOS Version:
              <select
                value={versionFilter}
                onChange={(e) => setVersionFilter(e.target.value)}
              >
                <option value="">All Versions</option>
                {versions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('hostname')}>
                  Hostname {sortField === 'hostname' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>IP Address</th>
                <th>Uptime</th>
                <th>Model</th>
                <th>Site</th>
                <th className="sortable" onClick={() => handleSort('region')}>
                  Region {sortField === 'region' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="sortable" onClick={() => handleSort('junos_version')}>
                  Version {sortField === 'junos_version' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Last Backup</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device) => {
                const uptime = uptimeData[device.id];
                return (
                <tr key={device.id}>
                  <td>
                    <Link href={`/devices/${device.id}`}>
                      <strong>{device.hostname}</strong>
                    </Link>
                  </td>
                  <td><code>{device.mgmt_ip}</code></td>
                  <td>
                    {uptime ? (
                      <span className={`status-badge status-${uptime.status_color}`}>
                        {uptime.status_text}
                      </span>
                    ) : (
                      <span className="status-badge status-gray">-</span>
                    )}
                  </td>
                  <td>{device.model || '-'}</td>
                  <td>{device.site || '-'}</td>
                  <td>
                    <span className="badge badge-info">{device.region || 'Unknown'}</span>
                  </td>
                  <td>{device.junos_version || '-'}</td>
                  <td>
                    {device.last_backup_at
                      ? new Date(device.last_backup_at).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="button button-small"
                        onClick={() => handleBackup(device.id, device.hostname)}
                        title="Backup Configuration"
                      >
                        Backup
                      </button>
                      <button
                        className="button button-small button-secondary"
                        onClick={() => handleHealthCheck(device.id, device.hostname)}
                        title="Run Health Check"
                      >
                        Health Check
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>

        {/* Add Device Modal */}
        {showAddModal && (
          <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add New Device</h2>
                <button className="modal-close" onClick={() => setShowAddModal(false)}>
                  ×
                </button>
              </div>

              <form onSubmit={handleAddDevice}>
                <div className="form-grid">
                  {/* Required Fields */}
                  <div className="form-section">
                    <h3>Required Information</h3>

                    <label>
                      Hostname *
                      <input
                        type="text"
                        required
                        value={newDevice.hostname}
                        onChange={(e) => setNewDevice({ ...newDevice, hostname: e.target.value })}
                        placeholder="srx-fw-01"
                      />
                    </label>

                    <label>
                      Management IP *
                      <input
                        type="text"
                        required
                        value={newDevice.mgmt_ip}
                        onChange={(e) => setNewDevice({ ...newDevice, mgmt_ip: e.target.value })}
                        placeholder="192.168.1.1"
                      />
                    </label>
                  </div>

                  {/* SSH Credentials */}
                  <div className="form-section">
                    <h3>SSH Credentials (Optional)</h3>
                    <p className="form-hint">Leave blank to use default credentials</p>

                    <label>
                      SSH Username
                      <input
                        type="text"
                        value={newDevice.ssh_user}
                        onChange={(e) => setNewDevice({ ...newDevice, ssh_user: e.target.value })}
                        placeholder="admin"
                      />
                    </label>

                    <label>
                      SSH Password
                      <input
                        type="password"
                        value={newDevice.ssh_password}
                        onChange={(e) => setNewDevice({ ...newDevice, ssh_password: e.target.value })}
                        placeholder="••••••••"
                      />
                    </label>

                    <label>
                      SSH Port
                      <input
                        type="number"
                        value={newDevice.ssh_port}
                        onChange={(e) => setNewDevice({ ...newDevice, ssh_port: parseInt(e.target.value) })}
                        placeholder="22"
                      />
                    </label>
                  </div>

                  {/* Location Information */}
                  <div className="form-section">
                    <h3>Location Information (Optional)</h3>

                    <label>
                      Site
                      <input
                        type="text"
                        value={newDevice.site}
                        onChange={(e) => setNewDevice({ ...newDevice, site: e.target.value })}
                        placeholder="HQ Data Center"
                      />
                    </label>

                    <label>
                      City
                      <input
                        type="text"
                        value={newDevice.city}
                        onChange={(e) => setNewDevice({ ...newDevice, city: e.target.value })}
                        placeholder="San Francisco"
                      />
                    </label>

                    <label>
                      State
                      <input
                        type="text"
                        value={newDevice.state}
                        onChange={(e) => setNewDevice({ ...newDevice, state: e.target.value })}
                        placeholder="CA"
                      />
                    </label>

                    <label>
                      Region
                      <input
                        type="text"
                        value={newDevice.region}
                        onChange={(e) => setNewDevice({ ...newDevice, region: e.target.value })}
                        placeholder="US-West"
                      />
                    </label>
                  </div>

                  {/* Additional Information */}
                  <div className="form-section">
                    <h3>Additional Information (Optional)</h3>

                    <label>
                      Entity
                      <input
                        type="text"
                        value={newDevice.entity}
                        onChange={(e) => setNewDevice({ ...newDevice, entity: e.target.value })}
                        placeholder="Corporate"
                      />
                    </label>

                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newDevice.enabled}
                        onChange={(e) => setNewDevice({ ...newDevice, enabled: e.target.checked })}
                      />
                      <span>Device Enabled</span>
                    </label>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setShowAddModal(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={saving}
                  >
                    {saving ? 'Creating...' : 'Create Device'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .page-header h1 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
          font-size: 2rem;
        }

        .page-header p {
          margin: 0;
          color: #6b7280;
        }

        .filters {
          margin-bottom: 1.5rem;
          padding: 1.5rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
        }

        .filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .filters label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-weight: 500;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .filters input,
        .filters select {
          padding: 0.625rem;
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-md);
          font-size: 1rem;
          transition: all 0.2s;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .filters input:focus,
        .filters select:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        th.sortable {
          cursor: pointer;
          user-select: none;
        }

        th.sortable:hover {
          background: var(--bg-hover);
        }

        .button-link {
          background: none;
          border: none;
          color: #667eea;
          text-decoration: underline;
          cursor: pointer;
          font-size: inherit;
          padding: 0;
          transition: color 0.2s;
        }

        .button-link:hover {
          color: #764ba2;
        }

        .table-container {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          overflow-x: auto;
          box-shadow: var(--shadow-sm);
        }

        code {
          font-family: 'Courier New', monospace;
          background: var(--bg-tertiary);
          color: var(--text-primary);
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
        }

        /* Action Buttons Container */
        .action-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .action-buttons .button {
          margin: 0;
        }

        /* Status Badge Styles */
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-green {
          background: #d1fae5;
          color: #065f46;
        }

        .status-red {
          background: #fee2e2;
          color: #991b1b;
        }

        .status-yellow {
          background: #fef3c7;
          color: #92400e;
        }

        .status-gray {
          background: #f3f4f6;
          color: #6b7280;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
        }

        .modal-content {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          max-width: 900px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow-xl);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid var(--border-secondary);
        }

        .modal-header h2 {
          margin: 0;
          color: var(--text-primary);
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 2rem;
          cursor: pointer;
          color: var(--text-secondary);
          line-height: 1;
          padding: 0;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background 0.2s;
        }

        .modal-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .modal-content form {
          padding: 2rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2rem;
        }

        .form-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-section h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
          color: var(--text-primary);
          font-weight: 600;
        }

        .form-hint {
          margin: -0.5rem 0 0.5rem 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .form-section label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-weight: 500;
          font-size: 0.875rem;
          color: var(--text-primary);
        }

        .form-section input[type="text"],
        .form-section input[type="password"],
        .form-section input[type="number"] {
          padding: 0.625rem;
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-md);
          font-size: 1rem;
          transition: all 0.2s;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .form-section input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .checkbox-label {
          flex-direction: row !important;
          align-items: center;
          gap: 0.75rem !important;
        }

        .checkbox-label input[type="checkbox"] {
          width: 1.25rem;
          height: 1.25rem;
          cursor: pointer;
        }

        .checkbox-label span {
          font-weight: 500;
          color: #374151;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding: 1.5rem 2rem;
          border-top: 1px solid var(--border-secondary);
          background: var(--bg-secondary);
          border-bottom-left-radius: var(--radius-lg);
          border-bottom-right-radius: var(--radius-lg);
        }

        .button-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: var(--radius-md);
          font-weight: 500;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .button-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .button-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button-secondary {
          background: var(--bg-primary);
          color: var(--text-primary);
          border: 1px solid var(--border-secondary);
          padding: 0.75rem 1.5rem;
          border-radius: var(--radius-md);
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .button-secondary:hover:not(:disabled) {
          background: var(--bg-hover);
        }

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }

          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
        }
      `}</style>
    </>
  );
}
