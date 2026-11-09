import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './experience.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

import './material.css';
import './play-scene.css';

import './practice-design.css';

import './message-overlay.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Browsers that disallow service workers can still use the online app.
    });
  });
}
