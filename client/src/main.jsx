import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import VendorLicenseGate from '../../../shared/vendor-license/react/VendorLicenseGate.jsx';
import { api } from './api/client';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VendorLicenseGate fetchStatus={api.getVendorLicenseStatus}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </VendorLicenseGate>
  </React.StrictMode>,
);
