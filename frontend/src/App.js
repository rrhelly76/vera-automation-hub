import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import VSpherePage from './pages/VSpherePage';
import VCenterPage from './pages/VCenterPage';
import VSphereClustersPage from './pages/VSphereClustersPage';
import VSphereLandingPage from './pages/VSphereLandingPage';
import NSXPage from './pages/NSXPage';
import VCDPage from './pages/VCDPage';
import UsageMeterPage from './pages/UsageMeterPage';
import DashboardPage from './pages/DashboardPage';
import VCenterConfigPage from './pages/VCenterConfigPage';
import NSXConfigPage from './pages/NSXConfigPage';
import VCDConfigPage from './pages/VCDConfigPage';
import UsageMeterConfigPage from './pages/UsageMeterConfigPage';
import UserManagementPage from './pages/UserManagementPage';
import UserPreferencesPage from './pages/UserPreferencesPage';
import SSLConfigPage from './pages/SSLConfigPage';
import LDAPConfigPage from './pages/LDAPConfigPage';
import SettingsPage from './pages/SettingsPage';
import DevelopmentWarningModal from './components/DevelopmentWarningModal';
import { formatDateTime } from './utils/dateUtils';
import './App.css';

// Configure axios to connect to backend
axios.defaults.withCredentials = true;

// Dynamically set API endpoint based on current hostname
const apiHost = window.location.hostname;
const apiPort = '5000';
axios.defaults.baseURL = `http://${apiHost}:${apiPort}`;

console.log('API endpoint:', axios.defaults.baseURL);

// Private route wrapper component
function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AppContent() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [syncStatus, setSyncStatus] = useState({});
  const [technologies, setTechnologies] = useState([]);
  const [userTimezone, setUserTimezone] = useState('UTC');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (user) {
      loadSyncStatus();
      loadUserPreferences();
      const interval = setInterval(loadSyncStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Reload preferences when navigating (to pick up timezone changes)
  useEffect(() => {
    if (user) {
      loadUserPreferences();
    }
  }, [location, user]);

  // Apply dark mode class to document body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  const loadUserPreferences = async () => {
    try {
      const response = await axios.get('/api/user/preferences');
      setUserTimezone(response.data.timezone || 'UTC');
      setDarkMode(response.data.dark_mode || false);
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const response = await axios.get('/api/sync-status');
      setSyncStatus(response.data);
      setTechnologies(Object.keys(response.data));
    } catch (error) {
      console.error('Error loading sync status:', error);
    }
  };

  const hasPermission = (permission) => {
    return user?.permissions?.[permission] === true;
  };

  const handleLogout = async () => {
    await logout();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="App">
      <DevelopmentWarningModal />
      
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            Databank Cloud Version Tracker
          </Link>
          <ul className="nav-menu">
            <li className="nav-item">
              <Link to="/" className="nav-link">Dashboard</Link>
            </li>
            <li className="nav-item">
              <Link to="/vsphere-landing" className="nav-link">
                vSphere
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/nsx-t" className="nav-link">
                NSX-T
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/vcd" className="nav-link">
                vCloud Director
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/usage-meter" className="nav-link">
                Usage Meter
              </Link>
            </li>
            {hasPermission('config') && (
              <li className="nav-item">
                <Link to="/settings" className="nav-link">
                  Settings
                </Link>
              </li>
            )}
          </ul>
          <div className="nav-user">
            <span className="user-info">
              <span className="username">{user.username}</span>
              <span className="user-role">{user.role}</span>
            </span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="sync-status-bar">
        {Object.entries(syncStatus).map(([tech, status]) => (
          <div key={tech} className={`sync-status ${status.status}`}>
            <span className="tech-name">{tech.toUpperCase()}</span>
            <span className="status-indicator">
              {status.status === 'success' ? '✓' : '✗'}
            </span>
            <span className="sync-time">
              Last sync: {formatDateTime(status.last_sync_time, userTimezone)}
            </span>
          </div>
        ))}
      </div>

      <div className="content">
        <Routes>
          <Route path="/" element={<DashboardPage technologies={technologies} syncStatus={syncStatus} userTimezone={userTimezone} />} />
          <Route path="/vsphere-landing" element={<VSphereLandingPage />} />
          <Route path="/vcenters" element={<VCenterPage onRefresh={loadSyncStatus} userTimezone={userTimezone} />} />
          <Route path="/vsphere" element={<VSpherePage onRefresh={loadSyncStatus} userTimezone={userTimezone} />} />
          <Route path="/vsphere-clusters" element={<VSphereClustersPage onRefresh={loadSyncStatus} userTimezone={userTimezone} />} />
          <Route path="/nsx-t" element={<NSXPage onRefresh={loadSyncStatus} userTimezone={userTimezone} />} />
          <Route path="/vcd" element={<VCDPage onRefresh={loadSyncStatus} userTimezone={userTimezone} />} />
          <Route path="/usage-meter" element={<UsageMeterPage onRefresh={loadSyncStatus} userTimezone={userTimezone} />} />
          
          {/* User Preferences - accessible to all users */}
          <Route path="/user-preferences" element={<UserPreferencesPage />} />
          
          {/* Config routes - only accessible to Admin */}
          {hasPermission('config') && (
            <>
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/vcenter-config" element={<VCenterConfigPage />} />
              <Route path="/nsx-t-config" element={<NSXConfigPage />} />
              <Route path="/vcd-config" element={<VCDConfigPage />} />
              <Route path="/usage-meter-config" element={<UsageMeterConfigPage />} />
              <Route path="/user-management" element={<UserManagementPage userTimezone={userTimezone} />} />
              <Route path="/ssl-config" element={<SSLConfigPage userTimezone={userTimezone} />} />
              <Route path="/ldap-config" element={<LDAPConfigPage userTimezone={userTimezone} />} />
            </>
          )}
        </Routes>
      </div>

      <footer className="footer">
        <div className="footer-content">
          Copyright © {new Date().getFullYear()} Databank Managed Services - Cloud Operations
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <PrivateRoute>
              <AppContent />
            </PrivateRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
