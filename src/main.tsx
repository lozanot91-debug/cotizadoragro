import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@fontsource-variable/archivo/wdth.css';
import './index.css';
import { registrarServiceWorker } from './lib/pwa';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

registrarServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
