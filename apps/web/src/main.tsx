import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import '@folio/design-tokens/auth.css';
import '@folio/design-tokens/responsive.css';
import { App } from './App';
import { SessionBootstrap } from './auth/session';
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});
const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionBootstrap />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
