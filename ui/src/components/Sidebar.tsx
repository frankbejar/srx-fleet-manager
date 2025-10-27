/**
 * Collapsible Sidebar Navigation
 * Modern, minimal sidebar with icon-based navigation
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from './Sidebar.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: JSX.Element;
  match?: (pathname: string) => boolean;
}

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    href: '/devices',
    label: 'Devices',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 4a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M7 8h6M7 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    match: (pathname) => pathname.startsWith('/devices'),
  },
  {
    href: '/jobs',
    label: 'Jobs',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" fill="currentColor"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h6a1 1 0 100-2H7zm0 4a1 1 0 000 2h6a1 1 0 100-2H7z" fill="currentColor"/>
      </svg>
    ),
  },
];

export default function Sidebar() {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Load sidebar state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sidebarExpanded');
    if (stored !== null) {
      setIsExpanded(stored === 'true');
    }
    setMounted(true);
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('sidebarExpanded', String(isExpanded));
    }
  }, [isExpanded, mounted]);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const isActive = (item: NavItem) => {
    if (item.match) {
      return item.match(router.pathname);
    }
    return router.pathname === item.href;
  };

  return (
    <aside className={`${styles.sidebar} ${isExpanded ? styles.expanded : styles.collapsed}`}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="url(#gradient)"/>
            <path d="M14 8v12M8 14h12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="28" y2="28">
                <stop stopColor="#667eea"/>
                <stop offset="1" stopColor="#764ba2"/>
              </linearGradient>
            </defs>
          </svg>
          {isExpanded && <span className={styles.brandText}>SRX Manager</span>}
        </div>
        <button
          onClick={toggleSidebar}
          className={styles.toggleButton}
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${isActive(item) ? styles.active : ''}`}
            title={!isExpanded ? item.label : undefined}
          >
            <span className={styles.icon}>{item.icon}</span>
            {isExpanded && <span className={styles.label}>{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={`${styles.navItem} ${styles.settings}`}>
          <span className={styles.icon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path fillRule="evenodd" clipRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" fill="currentColor"/>
            </svg>
          </span>
          {isExpanded && <span className={styles.label}>Settings</span>}
        </div>
      </div>
    </aside>
  );
}
