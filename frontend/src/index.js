import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';

// Development-only: suppress already-opted-in React Router future flag warnings to keep console clean.
if (process.env.NODE_ENV === 'development') {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('React Router Future Flag Warning')) {
      // If we already pass future flags in App, skip repeating the deprecation noise.
      if (args[0].includes('v7_startTransition') || args[0].includes('v7_relativeSplatPath')) return;
    }
    originalWarn(...args);
  };
}

// Simple runtime diagnostic (one-time) to verify router future flags are active
if (process.env.NODE_ENV === 'development') {
  setTimeout(() => {
    // Dynamically import router to inspect exported router instance if available
    import('./App').then(mod => {
      if (mod.router && mod.router.future) {
        // eslint-disable-next-line no-console
        console.info('[router future flags]', mod.router.future);
      }
    }).catch(()=>{});
  }, 0);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
