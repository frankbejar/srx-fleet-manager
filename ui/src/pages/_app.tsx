/**
 * Global App Component
 */

import type { AppProps } from 'next/app';
import '../styles/globals.css';
import Layout from '../components/Layout';
import { ThemeProvider } from '../lib/ThemeContext';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ThemeProvider>
  );
}
