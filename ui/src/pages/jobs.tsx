/**
 * Jobs History Page
 */

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { jobsApi, Job } from '../lib/api';

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadJobs = async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const classes = {
      pending: 'badge-warning',
      running: 'badge-info',
      success: 'badge-success',
      failed: 'badge-error',
    };
    return `badge ${classes[status as keyof typeof classes] || ''}`;
  };

  if (loading) {
    return <div className="loading">Loading jobs...</div>;
  }

  return (
    <>
      <Head>
        <title>Jobs - SRX Fleet Manager</title>
      </Head>

      <div className="container">
        <header>
          <h1>Job History</h1>
          <p>{jobs.length} job(s)</p>
        </header>

        <nav>
          <Link href="/">← Dashboard</Link>
          <Link href="/devices">Devices</Link>
        </nav>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Device ID</th>
                <th>Status</th>
                <th>Queued</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Duration</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const duration =
                  job.started_at && job.finished_at
                    ? Math.round(
                        (new Date(job.finished_at).getTime() -
                          new Date(job.started_at).getTime()) /
                          1000
                      )
                    : null;

                return (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td><strong>{job.job_type}</strong></td>
                    <td>
                      <Link href={`/devices/${job.device_id}`}>
                        #{job.device_id}
                      </Link>
                    </td>
                    <td>
                      <span className={getStatusBadge(job.status)}>
                        {job.status}
                      </span>
                    </td>
                    <td>{new Date(job.queued_at).toLocaleString()}</td>
                    <td>
                      {job.started_at
                        ? new Date(job.started_at).toLocaleTimeString()
                        : '-'}
                    </td>
                    <td>
                      {job.finished_at
                        ? new Date(job.finished_at).toLocaleTimeString()
                        : '-'}
                    </td>
                    <td>{duration ? `${duration}s` : '-'}</td>
                    <td>{job.user_email || 'system'}</td>
                  </tr>
                );
              })}
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

        .table-container {
          background: white;
          border-radius: 8px;
          overflow-x: auto;
        }
      `}</style>
    </>
  );
}
