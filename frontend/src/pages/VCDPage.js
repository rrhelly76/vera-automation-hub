import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import VersionHistory from '../components/VersionHistory';
import './DataPage.css';

function VCDPage({ onRefresh }) {
  const { hasPermission } = useAuth();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [expandedCells, setExpandedCells] = useState({});
  const [message, setMessage] = useState(null);
  const [environmentFilter, setEnvironmentFilter] = useState('all');

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/versions/vcd');
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
      'This action will refresh all data from your vCD instances.\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      setPulling(true);
      setMessage({ type: 'success', text: 'Pulling latest data from vCD...' });
      
      const response = await axios.post('/api/pull/vcd');
      
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

  const toggleCellsExpanded = (componentName) => {
    setExpandedCells(prev => ({
      ...prev,
      [componentName]: !prev[componentName]
    }));
  };

  const getFilteredVersions = () => {
    if (environmentFilter === 'all') {
      return versions;
    }
    return versions.filter(v => v.metadata.environment === environmentFilter);
  };

  const getUniqueEnvironments = () => {
    const environments = new Set();
    versions.forEach(v => environments.add(v.metadata.environment || 'Untagged'));
    return Array.from(environments).sort();
  };

  const exportToCSV = () => {
    const filteredVersions = getFilteredVersions();
    
    if (filteredVersions.length === 0) {
      alert('No instances to export with current filters');
      return;
    }

    const headers = [
      'Instance Name',
      'Version',
      'API Version',
      'Environment',
      'Organizations',
      'Org Count',
      'Cell Count',
      'Active Cells',
      'Last Updated'
    ];

    const rows = filteredVersions.map(instance => {
      const cells = instance.metadata.cells || [];
      const activeCells = cells.filter(c => c.is_active).length;
      
      return [
        instance.component_name,
        instance.version,
        instance.metadata.api_version,
        instance.metadata.environment,
        instance.metadata.organizations || 'N/A',
        instance.metadata.org_count || 0,
        cells.length,
        activeCells,
        new Date(instance.last_updated).toLocaleString()
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    let filename = 'vcd-instances';
    if (environmentFilter !== 'all') filename += `-${environmentFilter}`;
    filename += `-${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setMessage({ 
      type: 'success', 
      text: `Exported ${filteredVersions.length} instance${filteredVersions.length !== 1 ? 's' : ''} to ${filename}` 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const filteredVersions = getFilteredVersions();
  const environments = getUniqueEnvironments();
  
  // Calculate total cells
  const totalCells = versions.reduce((sum, v) => sum + ((v.metadata.cells || []).length), 0);
  const totalActiveCells = versions.reduce((sum, v) => {
    const cells = v.metadata.cells || [];
    return sum + cells.filter(c => c.is_active).length;
  }, 0);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading vCD version data...</p>
      </div>
    );
  }

  return (
    <div className="vmware-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">vCloud Director Instances</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', color: '#7f8c8d' }}>
            View and manage vCloud Director version information
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            className="btn"
            onClick={exportToCSV}
            disabled={loading || filteredVersions.length === 0}
            style={{ backgroundColor: '#27ae60', color: 'white' }}
            title="Export filtered instances to CSV"
          >
            Export ({filteredVersions.length})
          </button>
          {hasPermission('config') && (
            <Link 
              to="/vcd-config"
              className="btn"
              style={{ backgroundColor: '#95a5a6', color: 'white', textDecoration: 'none', display: 'inline-block' }}
              title="Configure vCD connections"
            >
              Configuration
            </Link>
          )}
          {(hasPermission('config') || hasPermission('pull')) && (
            <button 
              className="btn btn-primary" 
              onClick={handlePullNow}
              disabled={pulling}
            >
              {pulling ? 'Pulling...' : 'Pull Now'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

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
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{versions.length}</div>
            <div style={{ color: '#7f8c8d' }}>vCD Instances</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9b59b6' }}>
              {versions.reduce((sum, v) => sum + (v.metadata.org_count || 0), 0)}
            </div>
            <div style={{ color: '#7f8c8d' }}>Total Organizations</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>
              {totalActiveCells}/{totalCells}
            </div>
            <div style={{ color: '#7f8c8d' }}>Active Cells</div>
          </div>
        </div>
      )}

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
                    {env} ({count} instance{count !== 1 ? 's' : ''})
                  </option>
                );
              })}
            </select>
          </div>

          {environmentFilter !== 'all' && (
            <button
              className="btn"
              onClick={() => setEnvironmentFilter('all')}
              style={{ backgroundColor: '#95a5a6', color: 'white', marginLeft: 'auto' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {versions.length === 0 ? (
        <div className="empty-state">
          <h2>No vCD Data Available</h2>
          <p>Click "Pull Now" to collect data from your vCD instances.</p>
          <p>If you haven't configured any vCD connections yet, go to <strong>vCD Config</strong> in the navigation to add them.</p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {versions.length !== filteredVersions.length ? (
              <h2 style={{ margin: 0, color: '#2c3e50' }}>
                Showing {filteredVersions.length} of {versions.length} instances
              </h2>
            ) : (
              <h2 style={{ margin: 0, color: '#2c3e50' }}>
                {versions.length} instance{versions.length !== 1 ? 's' : ''} total
              </h2>
            )}
          </div>
          
          <div className="version-table">
            <div className="table-header">
              <div>Instance Name</div>
              <div>Version</div>
              <div>Environment</div>
              <div>Organizations</div>
              <div>Cells</div>
              <div>Last Updated</div>
              <div>Actions</div>
            </div>
            {filteredVersions.map((item, index) => {
              const cells = item.metadata.cells || [];
              const activeCells = cells.filter(c => c.is_active).length;
              const isCellsExpanded = expandedCells[item.component_name];
              
              return (
                <React.Fragment key={index}>
                  <div className="table-row">
                    <div className="component-name">
                      {item.component_name}
                      <div className="metadata">
                        <span className="metadata-item">
                          {item.metadata.hostname}
                        </span>
                        <span className="metadata-item">
                          API: {item.metadata.api_version}
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
                        {item.metadata.org_count || 0} orgs
                      </span>
                    </div>
                    <div>
                      {cells.length > 0 ? (
                        <button
                          onClick={() => toggleCellsExpanded(item.component_name)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#3498db',
                            textDecoration: 'underline',
                            padding: 0,
                            fontSize: '0.95rem'
                          }}
                        >
                          {activeCells}/{cells.length} active {isCellsExpanded ? '▼' : '▶'}
                        </button>
                      ) : (
                        <span className="badge badge-warning">No cells</span>
                      )}
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
                  
                  {isCellsExpanded && cells.length > 0 && (
                    <div style={{
                      gridColumn: '1 / -1',
                      backgroundColor: '#f8f9fa',
                      padding: '1rem',
                      borderRadius: '8px',
                      marginTop: '-0.5rem',
                      marginBottom: '0.5rem'
                    }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>Application Cells</h4>
                      <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {cells.map((cell, cellIndex) => (
                          <div key={cellIndex} style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr 1fr 1fr',
                            gap: '1rem',
                            padding: '0.75rem',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            borderLeft: `4px solid ${cell.is_active ? '#27ae60' : '#e74c3c'}`,
                            alignItems: 'center'
                          }}>
                            <div>
                              <strong>{cell.name}</strong>
                              {cell.host && cell.host !== cell.name && (
                                <div style={{ fontSize: '0.85rem', color: '#7f8c8d' }}>
                                  {cell.host}
                                </div>
                              )}
                            </div>
                            <div>
                              <span className={`badge badge-${cell.is_active ? 'success' : 'error'}`}>
                                {cell.status}
                              </span>
                            </div>
                            <div>
                              {cell.is_active && (
                                <span className="badge badge-success">Active</span>
                              )}
                              {!cell.is_active && (
                                <span className="badge badge-error">Inactive</span>
                              )}
                            </div>
                            <div>
                              {cell.is_primary && (
                                <span className="badge badge-primary">Primary</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {selectedComponent && (
        <VersionHistory 
          component={selectedComponent}
          technology="vcd"
          onClose={() => setSelectedComponent(null)}
        />
      )}
    </div>
  );
}

export default VCDPage;
