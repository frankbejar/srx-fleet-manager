/**
 * Homepage / Dashboard
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
    return <div className="container"><p>Loading...</p></div>;
  }

  return (
    <>
      <Head>
        <title>SRX Fleet Manager</title>
        <meta name="description" content="Enterprise SRX firewall fleet management" />
      </Head>

      <div className="container">
        <header>
          <h1>🔥 SRX Fleet Manager</h1>
          <p>Enterprise-grade Juniper SRX firewall fleet management</p>
        </header>

        <nav>
          <Link href="/devices">Devices</Link>
          <Link href="/jobs">Jobs</Link>
        </nav>

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Devices</h3>
            <p className="big-number">{stats?.total_devices || 0}</p>
            <small>{stats?.enabled_devices || 0} enabled</small>
          </div>

          <div className="stat-card">
            <h3>Active Jobs</h3>
            <p className="big-number">{jobStats?.running || 0}</p>
            <small>{jobStats?.pending || 0} pending</small>
          </div>

          <div className="stat-card">
            <h3>Success Rate</h3>
            <p className="big-number">
              {jobStats?.total > 0
                ? Math.round((jobStats.success / jobStats.total) * 100)
                : 0}
              %
            </p>
            <small>{jobStats?.success || 0} successful jobs</small>
          </div>

          <div className="stat-card">
            <h3>Regions</h3>
            <p className="big-number">
              {stats?.by_region ? Object.keys(stats.by_region).length : 0}
            </p>
            <small>Active deployment regions</small>
          </div>
        </div>

        {stats?.by_region && (
          <div className="section">
            <h2>Devices by Region</h2>
            <div className="region-list">
              {Object.entries(stats.by_region).map(([region, count]: [string, any]) => (
                <div key={region} className="region-item">
                  <span className="region-name">{region}</span>
                  <span className="region-count">{count} devices</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="actions">
          <Link href="/devices" className="button button-primary">
            View All Devices →
          </Link>
          <Link href="/jobs" className="button">
            View Job History →
          </Link>
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        header {
          text-align: center;
          margin-bottom: 3rem;
        }

        header h1 {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
        }

        nav {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 8px;
        }

        nav a {
          padding: 0.5rem 1rem;
          text-decoration: none;
          color: #333;
          border-radius: 4px;
          transition: background 0.2s;
        }

        nav a:hover {
          background: #e0e0e0;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 3rem;
        }

        .stat-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1.5rem;
          text-align: center;
        }

        .stat-card h3 {
          font-size: 0.9rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 1rem;
        }

        .big-number {
          font-size: 3rem;
          font-weight: bold;
          color: #2196F3;
          margin: 0.5rem 0;
        }

        .section {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 2rem;
          margin-bottom: 2rem;
        }

        .region-list {
          display: grid;
          gap: 0.5rem;
        }

        .region-item {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem;
          background: #f9f9f9;
          border-radius: 4px;
        }

        .region-name {
          font-weight: 500;
        }

        .region-count {
          color: #666;
        }

        .actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }

        .button {
          display: inline-block;
          padding: 0.75rem 1.5rem;
          text-decoration: none;
          border-radius: 4px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .button-primary {
          background: #2196F3;
          color: white;
        }

        .button-primary:hover {
          background: #1976D2;
        }

        .button {
          background: #f5f5f5;
          color: #333;
        }

        .button:hover {
          background: #e0e0e0;
        }
      `}</style>
    </>
  );
}
