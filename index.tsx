import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ClientPortal } from './screens/ClientPortal';
import { ClientRegistration } from './screens/ClientRegistration';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Detect public routes
const path = window.location.pathname;

// Client Portal: /acompanhar/{token}
const portalMatch = path.match(/^\/acompanhar\/([a-zA-Z0-9_-]+)\/?$/);
const portalToken = portalMatch ? portalMatch[1] : null;

// Client Registration: /cadastro/{token}
const registrationMatch = path.match(/^\/cadastro\/([a-zA-Z0-9_-]+)\/?$/);
const registrationToken = registrationMatch ? registrationMatch[1] : null;

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {portalToken ? <ClientPortal token={portalToken} /> :
      registrationToken ? <ClientRegistration token={registrationToken} /> :
        <App />}
  </React.StrictMode>
);