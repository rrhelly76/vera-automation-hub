import React from 'react';
import { Link } from 'react-router-dom';
import './SettingsPage.css';

function SettingsPage() {
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage system configuration and access control</p>
      </div>

      <div className="settings-cards">
        <Link to="/user-preferences" className="settings-card">
          <div className="settings-card-icon">⚙️</div>
          <h2>User Preferences</h2>
          <p>Customize your personal settings and time zone</p>
          <span className="settings-card-arrow">→</span>
        </Link>

        <Link to="/user-management" className="settings-card">
          <div className="settings-card-icon">👥</div>
          <h2>User Management</h2>
          <p>Manage users, roles, and access permissions</p>
          <span className="settings-card-arrow">→</span>
        </Link>

        <Link to="/ssl-config" className="settings-card">
          <div className="settings-card-icon">🔒</div>
          <h2>SSL Configuration</h2>
          <p>Configure SSL certificates and HTTPS settings</p>
          <span className="settings-card-arrow">→</span>
        </Link>

        <Link to="/ldap-config" className="settings-card">
          <div className="settings-card-icon">🔐</div>
          <h2>LDAP Configuration</h2>
          <p>Configure LDAP authentication and group mappings</p>
          <span className="settings-card-arrow">→</span>
        </Link>
      </div>
    </div>
  );
}

export default SettingsPage;
