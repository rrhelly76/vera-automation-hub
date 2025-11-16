import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import VersionHistory from '../components/VersionHistory';
import './DataPage.css';

function UsageMeterPage({ onRefresh }) {
  const { hasPermission } = useAuth();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [message, setMessage] = useState(null);
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [meterFilter, setMeterFilter] = useState('all');

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/versions/usage-meter');
      setVersions(response.data);
    } catch (error) {
      console.error('Error loading versions:', error);
      setMessage({ type: 'error', text: 'Failed to load version data' });
    } finally {
      setLoading(false);
    }
  };

  const handlePullNow = async () => {
    const confirmed = window.confirm(
      'This action will refresh all data from your Usage Meters.\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      setPulling(true);
      setMessage({ type: 'success', text: 'Pulling latest data from Usage Meters...' });
      
      const response = await axios.post('/api/pull/usage-meter');
      
      if (response.data.success) {
        setMessage({ 
          type: 'success', 
          text: `Successfully collected data for ${response.data.count} components` 
        });
        await loadVersions();
        if (onRefresh) onRefresh();
      } else {
        setMessage({ 
          type: 'error', 
          text: `Error: ${response.data.error}` 
        });
      }
    } catch (error) {
      console.error('Error pulling data:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to pull data. Check your configuration and network connection.' 
      });
    } finally {
      setPulling(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const groupVersions = () => {
    let meters = versions.filter(v => v.metadata.type === 'usage-meter');
    let products = versions.filter(v => v.metadata.type === 'monitored-product');
    
    // Apply environment filter
    if (environmentFilter !== 'all') {
      meters = meters.filter(m => m.metadata.environment === environmentFilter);
      products = products.filter(p => p.metadata.environment === environmentFilter);
    }
    
    // Apply meter filter
    if (meterFilter !== 'all') {
      meters = meters.filter(m => m.component_name === meterFilter);
      products = products.filter(p => p.metadata.meter === meterFilter);
    }
    
    return { meters, products };
  };

  const getUniqueEnvironments = () => {
    const environments = new Set();
    versions.forEach(v => environments.add(v.metadata.environment || 'Untagged'));
    return Array.from(environments).sort();
  };

  const getUniqueMeters = () => {
    const meters = new Set();
    versions
      .filter(v => v.metadata.type === 'usage-meter')
      .forEach(v => meters.add(v.component_name));
    return Array.from(meters).sort();
  };

  const exportToCSV = () => {
    const { meters, products } = groupVersions();
    const allComponents = [...meters, ...products];
    
    if (allComponents.length === 0) {
      alert('No components to export with current filters');
      return;
    }

    const headers = [
      'Component Name',
      'Type',
      'Version',
      'Environment',
      'Meter',
      'Status',
      'Last Updated'
    ];

    const rows = allComponents.map(component => {
      if (component.metadata.type === 'usage-meter') {
        return [
          component.component_name,
          'Usage Meter',
          component.version,
          component.metadata.environment,
          '-',
          '-',
          new Date(component.last_updated).toLocaleString()
        ];
      } else {
        return [
          component.metadata.product_name,
          'Monitored Product',
          component.version,
          component.metadata.environment,
          component.metadata.meter,
          typeof component.metadata.status === 'object' 
            ? (component.metadata.status.text || component.metadata.status.statusCode || 'Unknown')
            : (component.metadata.status || 'Unknown'),
          new Date(component.last_updated).toLocaleString()
        ];
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    let filename = 'usage-meters';
    if (environmentFilter !== 'all') filename += `-${environmentFilter}`;
    if (meterFilter !== 'all') filename += `-${meterFilter}`;
    filename += `-${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setMessage({ 
      type: 'success', 
      text: `Exported ${allComponents.length} component${allComponents.length !== 1 ? 's' : ''} to ${filename}` 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const { meters, products } = groupVersions();
  const environments = getUniqueEnvironments();
  const meterList = getUniqueMeters();
  const totalMeters = versions.filter(v => v.metadata.type === 'usage-meter').length;
  const totalProducts = versions.filter(v => v.metadata.type === 'monitored-product').length;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading Usage Meter version data...</p>
      </div>
    );
  }

  return (
    <div className="vmware-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Usage Meter Infrastructure</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', color: '#7f8c8d' }}>
            View and manage Usage Meter versions and monitored products
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            className="btn"
            onClick={exportToCSV}
            disabled={loading || versions.length === 0}
            style={{ backgroundColor: '#27ae60', color: 'white' }}
            title="Export filtered components to CSV"
          >
            📥 Export ({meters.length + products.length})
          </button>
          {hasPermission('config') && (
            <Link 
              to="/usage-meter-config"
              className="btn"
              style={{ backgroundColor: '#95a5a6', color: 'white', textDecoration: 'none', display: 'inline-block' }}
              title="Configure Usage Meter connections"
            >
              ⚙️ Configuration
            </Link>
          )}
          {(hasPermission('config') || hasPermission('pull')) && (
            <button 
              className="btn btn-primary" 
              onClick={handlePullNow}
              disabled={pulling}
            >
              {pulling ? '🔄 Pulling...' : '🔄 Pull Now'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Summary Stats */}
      {versions.length > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px'
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{totalMeters}</div>
            <div style={{ color: '#7f8c8d' }}>Usage Meters</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9b59b6' }}>{totalProducts}</div>
            <div style={{ color: '#7f8c8d' }}>Monitored Products</div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      {versions.length > 0 && (
        <div className="filters-container">
          <div className="filter-group">
            <label htmlFor="environment-filter">
              <strong>Filter by Environment:</strong>
            </label>
            <select
              id="environment-filter"
              className="filter-select"
              value={environmentFilter}
              onChange={(e) => setEnvironmentFilter(e.target.value)}
            >
              <option value="all">All Environments</option>
              {environments.map(env => {
                const count = versions.filter(v => v.metadata.environment === env).length;
                return (
                  <option key={env} value={env}>
                    {env} ({count} components)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="meter-filter">
              <strong>Filter by Meter:</strong>
            </label>
            <select
              id="meter-filter"
              className="filter-select"
              value={meterFilter}
              onChange={(e) => setMeterFilter(e.target.value)}
            >
              <option value="all">All Meters</option>
              {meterList.map(meter => {
                const productCount = versions.filter(v => 
                  v.metadata.type === 'monitored-product' && v.metadata.meter === meter
                ).length;
                return (
                  <option key={meter} value={meter}>
                    {meter} ({productCount} products)
                  </option>
                );
              })}
            </select>
          </div>

          {(environmentFilter !== 'all' || meterFilter !== 'all') && (
            <button
              className="btn"
              onClick={() => {
                setEnvironmentFilter('all');
                setMeterFilter('all');
              }}
              style={{ backgroundColor: '#95a5a6', color: 'white', marginLeft: 'auto' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {versions.length === 0 ? (
        <div className="empty-state">
          <h2>No Usage Meter Data Available</h2>
          <p>Click "Pull Now" to collect data from your Usage Meters.</p>
        </div>
      ) : (
        <>
          {/* Usage Meters Section */}
          {meters.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
                Usage Meters ({meters.length})
              </h2>
              <div className="version-table">
                <div className="table-header">
                  <div>Meter Name</div>
                  <div>Version</div>
                  <div>Environment</div>
                  <div>Products</div>
                  <div>Last Updated</div>
                  <div>Actions</div>
                </div>
                {meters.map((item, index) => (
                  <div key={index} className="table-row">
                    <div className="component-name">
                      {item.component_name}
                      <div className="metadata">
                        <span className="metadata-item">
                          {item.metadata.hostname}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="version-badge">{item.version}</span>
                    </div>
                    <div>
                      <span className={`badge badge-${item.metadata.environment === 'Production' ? 'production' : 'info'}`}>
                        {item.metadata.environment}
                      </span>
                    </div>
                    <div>
                      <span className="badge badge-info">
                        {item.metadata.product_count} monitored
                      </span>
                    </div>
                    <div className="last-updated">
                      {new Date(item.last_updated).toLocaleString()}
                    </div>
                    <div>
                      <button 
                        className="view-history"
                        onClick={() => setSelectedComponent(item)}
                      >
                        View History
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monitored Products Section */}
          {products.length > 0 && (
            <div>
              <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
                Monitored Products ({products.length})
              </h2>
              <div className="version-table">
                <div className="table-header">
                  <div>Product Name</div>
                  <div>Version</div>
                  <div>Type</div>
                  <div>Meter</div>
                  <div>Status</div>
                  <div>Last Updated</div>
                  <div>Actions</div>
                </div>
                {products.map((item, index) => (
                  <div key={index} className="table-row">
                    <div className="component-name">
                      {item.metadata.product_name}
                      <div className="metadata">
                        <span className="metadata-item">
                          Environment: {item.metadata.environment}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="version-badge">{item.version}</span>
                    </div>
                    <div>
                      <span className="badge badge-info">
                        {item.metadata.product_type}
                      </span>
                    </div>
                    <div>
                      {item.metadata.meter}
                    </div>
                    <div>
                      {(() => {
                        const statusText = typeof item.metadata.status === 'object' 
                          ? (item.metadata.status.text || item.metadata.status.statusCode || 'Unknown')
                          : (item.metadata.status || 'Unknown');
                        
                        // Green for OK, red for anything else (warnings, errors, etc.)
                        const badgeClass = statusText === 'OK' ? 'badge-success' : 'badge-danger';
                        
                        return (
                          <span className={`badge ${badgeClass}`}>
                            {statusText}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="last-updated">
                      {new Date(item.last_updated).toLocaleString()}
                    </div>
                    <div>
                      <button 
                        className="view-history"
                        onClick={() => setSelectedComponent(item)}
                      >
                        View History
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Version History Modal */}
      {selectedComponent && (
        <VersionHistory
          component={selectedComponent}
          technology="usage-meter"
          onClose={() => setSelectedComponent(null)}
        />
      )}
    </div>
  );
}

export default UsageMeterPage;
