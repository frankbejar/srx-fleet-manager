/**
 * Devices List Page
 */

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { devicesApi, Device } from '../lib/api';

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedRegion]);

  const loadData = async () => {
    try {
      const [devicesData, regionsData] = await Promise.all([
        devicesApi.list({ region: selectedRegion || undefined }),
        devicesApi.regions(),
      ]);
      setDevices(devicesData);
      setRegions(regionsData);
    } catch (error) {
      console.error('Error loading devices:', error);
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return <div className="loading">Loading devices...</div>;
  }

  return (
    <>
      <Head>
        <title>Devices - SRX Fleet Manager</title>
      </Head>

      <div className="container">
        <header>
          <h1>SRX Devices</h1>
          <p>{devices.length} device(s) {selectedRegion && `in ${selectedRegion}`}</p>
        </header>

        <nav>
          <Link href="/">← Dashboard</Link>
          <Link href="/jobs">Jobs</Link>
        </nav>

        <div className="filters">
          <label>
            Filter by Region:
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              <option value="">All Regions</option>
              {regions.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} ({r.count})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Hostname</th>
                <th>IP Address</th>
                <th>Site</th>
                <th>Region</th>
                <th>Version</th>
                <th>WAN Type</th>
                <th>Last Backup</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td>
                    <Link href={`/devices/${device.id}`}>
                      <strong>{device.hostname}</strong>
                    </Link>
                  </td>
                  <td><code>{device.mgmt_ip}</code></td>
                  <td>{device.site || '-'}</td>
                  <td>
                    <span className="badge badge-info">{device.region || 'Unknown'}</span>
                  </td>
                  <td>{device.junos_version || '-'}</td>
                  <td>{device.wan_type || '-'}</td>
                  <td>
                    {device.last_backup_at
                      ? new Date(device.last_backup_at).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <button
                      className="button button-small"
                      onClick={() => handleBackup(device.id, device.hostname)}
                    >
                      Backup
                    </button>
                    {' '}
                    <button
                      className="button button-small button-secondary"
                      onClick={() => handleHealthCheck(device.id, device.hostname)}
                    >
                      Health Check
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        header {
          margin-bottom: 2rem;
        }

        nav {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          padding: 1rem;
          background: white;
          border-radius: 8px;
        }

        .filters {
          margin-bottom: 2rem;
          padding: 1rem;
          background: white;
          border-radius: 8px;
        }

        .filters label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .filters select {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          max-width: 300px;
        }

        .table-container {
          background: white;
          border-radius: 8px;
          overflow-x: auto;
        }

        code {
          font-family: 'Courier New', monospace;
          background: #f5f5f5;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
        }
      `}</style>
    </>
  );
}
