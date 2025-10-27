/**
 * Shared Layout Component
 * Modern sidebar-based layout with collapsible navigation
 */

import { ReactNode } from 'react';
import { getTimezoneAbbr } from '../lib/dateUtils';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className="layout">
        <Sidebar />

        <div className="layout-main">
          <header className="top-header">
            <div className="header-left">
              {/* Page title will go here in individual pages */}
            </div>
            <div className="header-right">
              <span className="timezone-badge">{getTimezoneAbbr()}</span>
              <ThemeToggle />
            </div>
          </header>

          <main className="main-content">
            {children}
          </main>

          <footer className="footer">
            <p>SRX Fleet Manager © 2024 | AI-Powered Network Automation</p>
          </footer>
        </div>
      </div>

      <style jsx>{`
        .layout {
          display: flex;
          min-height: 100vh;
          background-color: var(--bg-secondary);
        }

        .layout-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-left: 240px;
          transition: margin-left var(--transition-base);
        }

        .top-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
          background-color: var(--bg-primary);
          border-bottom: 1px solid var(--border-secondary);
          box-shadow: var(--shadow-sm);
        }

        .header-left {
          flex: 1;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .timezone-badge {
          display: inline-flex;
          align-items: center;
          padding: var(--space-2) var(--space-3);
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          font-weight: 500;
        }

        .main-content {
          flex: 1;
          max-width: 1600px;
          width: 100%;
          padding: var(--space-6);
        }

        .footer {
          background-color: var(--bg-primary);
          border-top: 1px solid var(--border-secondary);
          padding: var(--space-4) var(--space-6);
          text-align: center;
          color: var(--text-tertiary);
          font-size: var(--text-sm);
        }

        .footer p {
          margin: 0;
        }

        @media (max-width: 768px) {
          .layout-main {
            margin-left: 0;
          }

          .top-header {
            padding: var(--space-3) var(--space-4);
          }

          .main-content {
            padding: var(--space-4);
          }

          .footer {
            padding: var(--space-4);
          }
        }
      `}</style>
    </>
  );
}
