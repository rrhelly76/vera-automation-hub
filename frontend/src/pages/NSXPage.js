import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import axios from 'axios';
import VersionHistory from '../components/VersionHistory';
import './DataPage.css';

function NSXPage({ onRefresh }) {
  const { hasPermission } = useAuth();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [message, setMessage] = useState(null);
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [managerFilter, setManagerFilter] = useState('all');
  const [componentTypeFilter, setComponentTypeFilter] = useState('all');

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/versions/nsx-t');
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
      'This action will refresh all data from your NSX-T Managers.\n\n' +
      'This can take several minutes depending on the size of your infrastructure.\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      setPulling(true);
      setMessage({ type: 'success', text: 'Pulling latest data from NSX-T...' });
      
      const response = await axios.post('/api/pull/nsx-t');
      
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
    let managers = versions.filter(v => v.metadata.type === 'nsx-manager');
    let edgeNodes = versions.filter(v => v.metadata.type === 'edge-node');
    let hostNodes = versions.filter(v => v.metadata.type === 'host-transport-node');
    
    // Apply environment filter
    if (environmentFilter !== 'all') {
      managers = managers.filter(m => m.metadata.environment === environmentFilter);
      edgeNodes = edgeNodes.filter(e => e.metadata.environment === environmentFilter);
      hostNodes = hostNodes.filter(h => h.metadata.environment === environmentFilter);
    }
    
    // Apply manager filter
    if (managerFilter !== 'all') {
      managers = managers.filter(m => m.component_name === managerFilter);
      edgeNodes = edgeNodes.filter(e => e.metadata.manager === managerFilter);
      hostNodes = hostNodes.filter(h => h.metadata.manager === managerFilter);
    }
    
    // Apply component type filter
    if (componentTypeFilter === 'managers') {
      edgeNodes = [];
      hostNodes = [];
    } else if (componentTypeFilter === 'edges') {
      managers = [];
      hostNodes = [];
    } else if (componentTypeFilter === 'hosts') {
      managers = [];
      edgeNodes = [];
    }
    
    return { managers, edgeNodes, hostNodes };
  };

  const getUniqueEnvironments = () => {
    const environments = new Set();
    versions.forEach(v => environments.add(v.metadata.environment || 'Untagged'));
    return Array.from(environments).sort();
  };

  const getUniqueManagers = () => {
    const managers = new Set();
    versions
      .filter(v => v.metadata.type === 'nsx-manager')
      .forEach(v => managers.add(v.component_name));
    return Array.from(managers).sort();
  };

  const exportToCSV = () => {
    const { managers, edgeNodes, hostNodes } = groupVersions();
    const allComponents = [...managers, ...edgeNodes, ...hostNodes];
    
    if (allComponents.length === 0) {
      alert('No components to export with current filters');
      return;
    }

    // CSV headers
    const headers = [
      'Component Name',
      'Type',
      'Version',
      'Build',
      'Environment',
      'Manager',
      'Status',
      'Form Factor',
      'Deployment Type',
      'OS Type',
      'Maintenance Mode',
      'Last Updated'
    ];

    // CSV rows
    const rows = allComponents.map(component => {
      if (component.metadata.type === 'nsx-manager') {
        return [
          component.component_name,
          'NSX Manager',
          component.version,
          component.metadata.build,
          component.metadata.environment,
          '-',
          component.metadata.cluster_status,
          '-',
          '-',
          '-',
          '-',
          new Date(component.last_updated).toLocaleString()
        ];
      } else if (component.metadata.type === 'edge-node') {
        return [
          component.component_name,
          'Edge Node',
          component.version,
          '-',
          component.metadata.environment,
          component.metadata.manager,
          component.metadata.state,
          component.metadata.form_factor,
          component.metadata.deployment_type,
          '-',
          '-',
          new Date(component.last_updated).toLocaleString()
        ];
      } else if (component.metadata.type === 'host-transport-node') {
        return [
          component.component_name,
          'Host Transport Node',
          component.version,
          '-',
          component.metadata.environment,
          component.metadata.manager,
          '-',
          '-',
          '-',
          component.metadata.os_type,
          component.metadata.maintenance_mode,
          new Date(component.last_updated).toLocaleString()
        ];
      }
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Generate filename
    let filename = 'nsx-components';
    if (environmentFilter !== 'all') filename += `-${environmentFilter}`;
    if (managerFilter !== 'all') filename += `-${managerFilter}`;
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

  const { managers, edgeNodes, hostNodes } = groupVersions();
  const environments = getUniqueEnvironments();
  const managerList = getUniqueManagers();
  const totalComponents = versions.length;
  const totalManagers = versions.filter(v => v.metadata.type === 'nsx-manager').length;
  const totalEdges = versions.filter(v => v.metadata.type === 'edge-node').length;
  const totalHosts = versions.filter(v => v.metadata.type === 'host-transport-node').length;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading NSX-T version data...</p>
      </div>
    );
  }

  return (
    <div className="vmware-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">NSX-T Infrastructure</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', color: '#7f8c8d' }}>
            View and manage NSX-T Manager and Edge Node versions
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            className="btn"
            onClick={exportToCSV}
            disabled={loading || totalComponents === 0}
            style={{ backgroundColor: '#27ae60', color: 'white' }}
            title="Export filtered components to CSV"
          >
            📥 Export ({managers.length + edgeNodes.length + hostNodes.length})
          </button>
          {hasPermission('config') && (
            <Link 
              to="/nsx-t-config"
              className="btn"
              style={{ backgroundColor: '#95a5a6', color: 'white', textDecoration: 'none', display: 'inline-block' }}
              title="Configure NSX-T Manager connections"
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
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{totalManagers}</div>
            <div style={{ color: '#7f8c8d' }}>NSX Managers</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9b59b6' }}>{totalEdges}</div>
            <div style={{ color: '#7f8c8d' }}>Edge Nodes</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e67e22' }}>{totalHosts}</div>
            <div style={{ color: '#7f8c8d' }}>Host Transport Nodes</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2ecc71' }}>{totalComponents}</div>
            <div style={{ color: '#7f8c8d' }}>Total Components</div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      {versions.length > 0 && (
        <div className="filters-container">
          <div className="filter-group">
            <label htmlFor="component-type-filter">
              <strong>Filter by Type:</strong>
            </label>
            <select
              id="component-type-filter"
              className="filter-select"
              value={componentTypeFilter}
              onChange={(e) => setComponentTypeFilter(e.target.value)}
            >
              <option value="all">All Components</option>
              <option value="managers">NSX Managers Only ({totalManagers})</option>
              <option value="edges">Edge Nodes Only ({totalEdges})</option>
              <option value="hosts">Host Transport Nodes Only ({totalHosts})</option>
            </select>
          </div>

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
            <label htmlFor="manager-filter">
              <strong>Filter by Manager:</strong>
            </label>
            <select
              id="manager-filter"
              className="filter-select"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            >
              <option value="all">All Managers</option>
              {managerList.map(manager => {
                const edgeCount = versions.filter(v => 
                  v.metadata.type === 'edge-node' && v.metadata.manager === manager
                ).length;
                return (
                  <option key={manager} value={manager}>
                    {manager} ({edgeCount} edges)
                  </option>
                );
              })}
            </select>
          </div>

          {(environmentFilter !== 'all' || managerFilter !== 'all' || componentTypeFilter !== 'all') && (
            <button
              className="btn"
              onClick={() => {
                setEnvironmentFilter('all');
                setManagerFilter('all');
                setComponentTypeFilter('all');
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
          <h2>No NSX-T Data Available</h2>
          <p>Click "Pull Now" to collect data from your NSX-T Managers.</p>
        </div>
      ) : (
        <>
          {/* NSX Managers Section */}
          {managers.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
                NSX Managers ({managers.length})
              </h2>
              <div className="version-table">
                <div className="table-header">
                  <div>Manager Name</div>
                  <div>Version</div>
                  <div>Environment</div>
                  <div>Status</div>
                  <div>Last Updated</div>
                  <div>Actions</div>
                </div>
                {managers.map((item, index) => (
                  <div key={index} className="table-row">
                    <div className="component-name">
                      {item.component_name}
                      <div className="metadata">
                        {item.metadata.fqdn && (
                          <span className="metadata-item">
                            FQDN: {item.metadata.fqdn}
                          </span>
                        )}
                        {item.metadata.ip_address && (
                          <span className="metadata-item">
                            IP: {item.metadata.ip_address}
                          </span>
                        )}
                        {item.metadata.role && (
                          <span className="metadata-item">
                            Role: {item.metadata.role}
                          </span>
                        )}
                        {!item.metadata.fqdn && (
                          <span className="metadata-item">
                            {item.metadata.hostname}
                          </span>
                        )}
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
                      <span className={`badge ${item.metadata.cluster_status === 'STABLE' ? 'badge-success' : 'badge-warning'}`}>
                        {item.metadata.cluster_status}
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

          {/* Edge Nodes Section */}
          {edgeNodes.length > 0 && (
            <div>
              <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
                Edge Nodes ({edgeNodes.length})
              </h2>
              <div className="version-table">
                <div className="table-header">
                  <div>Edge Node Name</div>
                  <div>Version</div>
                  <div>Manager</div>
                  <div>Form Factor</div>
                  <div>State</div>
                  <div>Last Updated</div>
                  <div>Actions</div>
                </div>
                {edgeNodes.map((item, index) => (
                  <div key={index} className="table-row">
                    <div className="component-name">
                      {item.component_name}
                      <div className="metadata">
                        <span className="metadata-item">
                          {item.metadata.deployment_type}
                        </span>
                        <span className="metadata-item">
                          Environment: {item.metadata.environment}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="version-badge">{item.version}</span>
                    </div>
                    <div>
                      {item.metadata.manager}
                    </div>
                    <div>
                      <span className="badge badge-info">
                        {item.metadata.form_factor}
                      </span>
                    </div>
                    <div>
                      <span className={`badge ${item.metadata.state === 'success' ? 'badge-success' : 'badge-warning'}`}>
                        {item.metadata.state}
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

          {/* Host Transport Nodes Section */}
          {hostNodes.length > 0 && (
            <div>
              <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
                Host Transport Nodes ({hostNodes.length})
              </h2>
              <div className="version-table">
                <div className="table-header">
                  <div>Host Name</div>
                  <div>Version</div>
                  <div>OS Type</div>
                  <div>Manager</div>
                  <div>Maintenance Mode</div>
                  <div>Last Updated</div>
                  <div>Actions</div>
                </div>
                {hostNodes.map((item, index) => (
                  <div key={index} className="table-row">
                    <div className="component-name">
                      {item.component_name}
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
                        {item.metadata.os_type}
                      </span>
                    </div>
                    <div>
                      {item.metadata.manager}
                    </div>
                    <div>
                      <span className={`badge ${item.metadata.maintenance_mode === 'DISABLED' ? 'badge-success' : 'badge-warning'}`}>
                        {item.metadata.maintenance_mode}
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
        </>
      )}

      {/* Version History Modal */}
      {selectedComponent && (
        <VersionHistory
          component={selectedComponent}
          technology="nsx-t"
          onClose={() => setSelectedComponent(null)}
        />
      )}
    </div>
  );
}

export default NSXPage;
