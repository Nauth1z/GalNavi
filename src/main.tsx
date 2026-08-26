import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { restoreWindowState, watchWindowState } from './platform/desktop';
import './styles.css';

async function bootstrap() {
  await restoreWindowState();
  void watchWindowState();
  createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
}

void bootstrap();
