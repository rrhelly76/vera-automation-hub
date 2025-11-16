import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { formatDateTime } from '../utils/dateUtils';
import './DataPage.css';

function VSphereClustersPage({ onRefresh, userTimezone = 'UTC' }) {
  const { hasPermission } = useAuth();
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState(null);
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [vcenterFilter, setVcenterFilter] = useState('all');
  const [versionFilter, setVersionFilter] = useState('all');
  const [drsFilter, setDrsFilter] = useState('all');
  const [haFilter, setHaFilter] = useState('all');
  const [evcFilter, setEvcFilter] = useState('all');
  const [updateMethodFilter, setUpdateMethodFilter] = useState('all');

  useEffect(() => {
    loadClusters();
  }, []);

  const loadClusters = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vsphere/clusters');
      setClusters(response.data);
    } catch (error) {
      console.error('Error loading clusters:', error);
      setMessage({ type: 'error', text: 'Failed to load cluster data' });
    } finally {
      setLoading(false);
    }
  };

  const handlePullNow = async () => {
    const confirmed = window.confirm(
      'This action will refresh all data from your vCenter servers.\n\n' +
      'This can take 10+ minutes to run depending on the size of your infrastructure.\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      setPulling(true);
      setMessage({ type: 'success', text: 'Pulling latest data from vCenter...' });
      
      const response = await axios.post('/api/pull/vsphere');
      
      if (response.data.success) {
        setMessage({ 
          type: 'success', 
          text: `Successfully collected data for ${response.data.count} components` 
        });
        await loadClusters();
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

  const getFilteredClusters = () => {
    let filtered = [...clusters];
    
    if (environmentFilter !== 'all') {
      filtered = filtered.filter(c => c.environment === environmentFilter);
    }
    
    if (vcenterFilter !== 'all') {
      filtered = filtered.filter(c => c.vcenter === vcenterFilter);
    }
    
    if (versionFilter !== 'all') {
      filtered = filtered.filter(c => c.versions.includes(versionFilter));
    }
    
    if (drsFilter !== 'all') {
      filtered = filtered.filter(c => c.drs_automation === drsFilter);
    }
    
    if (haFilter !== 'all') {
      if (haFilter === 'enabled') {
        filtered = filtered.filter(c => c.ha_enabled === true);
      } else if (haFilter === 'disabled') {
        filtered = filtered.filter(c => c.ha_enabled === false);
      }
    }
    
    if (evcFilter !== 'all') {
      filtered = filtered.filter(c => c.evc_mode === evcFilter);
    }
    
    if (updateMethodFilter !== 'all') {
      filtered = filtered.filter(c => c.update_method === updateMethodFilter);
    }
    
    return filtered;
  };

  const getUniqueEnvironments = () => {
    const environments = new Set();
    clusters.forEach(c => environments.add(c.environment));
    return Array.from(environments).sort();
  };

  const getUniqueVcenters = () => {
    const vcenters = new Set();
    clusters.forEach(c => vcenters.add(c.vcenter));
    return Array.from(vcenters).sort();
  };

  const getUniqueVersions = () => {
    const versions = new Set();
    clusters.forEach(c => c.versions.forEach(v => versions.add(v)));
    return Array.from(versions).sort().reverse();
  };

  const getUniqueDrsLevels = () => {
    const drsLevels = new Set();
    clusters.forEach(c => {
      if (c.drs_automation) {
        drsLevels.add(c.drs_automation);
      }
    });
    return Array.from(drsLevels).sort();
  };

  const getUniqueEvcModes = () => {
    const evcModes = new Set();
    clusters.forEach(c => {
      if (c.evc_mode) {
        evcModes.add(c.evc_mode);
      }
    });
    return Array.from(evcModes).sort();
  };

  const getUniqueUpdateMethods = () => {
    const updateMethods = new Set();
    clusters.forEach(c => {
      if (c.update_method) {
        updateMethods.add(c.update_method);
      }
    });
    return Array.from(updateMethods).sort();
  };

  const exportToCSV = () => {
    const filteredClusters = getFilteredClusters();
    
    if (filteredClusters.length === 0) {
      alert('No clusters to export with current filters');
      return;
    }

    // CSV headers
    const headers = [
      'Cluster Name',
      'vCenter',
      'Environment',
      'Total Hosts',
      'Total VMs',
      'DRS Automation',
      'HA Enabled',
      'EVC Mode',
      'Update Method',
      'Compliance Status',
      'ESXi Versions',
      'Hardware Vendors',
      'Last Updated'
    ];

    // CSV rows
    const rows = filteredClusters.map(cluster => [
      cluster.name,
      cluster.vcenter,
      cluster.environment,
      cluster.host_count,
      cluster.vm_count,
      cluster.drs_automation || 'Unknown',
      cluster.ha_enabled ? 'Yes' : 'No',
      cluster.evc_mode || 'Disabled',
      cluster.update_method || 'Unknown',
      cluster.compliance_status || 'Unknown',
      cluster.versions.join('; '),
      cluster.hardware_vendors.join('; '),
      formatDateTime(cluster.last_updated, userTimezone)
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `vsphere_clusters_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const calculateStats = () => {
    const filteredClusters = getFilteredClusters();
    const totalHosts = filteredClusters.reduce((sum, c) => sum + c.host_count, 0);
    const totalVMs = filteredClusters.reduce((sum, c) => sum + c.vm_count, 0);
    const uniqueVersions = new Set();
    filteredClusters.forEach(c => c.versions.forEach(v => uniqueVersions.add(v)));
    
    return {
      clusters: filteredClusters.length,
      totalClusters: clusters.length,
      hosts: totalHosts,
      vms: totalVMs,
      uniqueVersions: uniqueVersions.size
    };
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading cluster data...</p>
      </div>
    );
  }

  const filteredClusters = getFilteredClusters();
  const stats = calculateStats();
  const environments = getUniqueEnvironments();
  const vcenters = getUniqueVcenters();
  const versions = getUniqueVersions();
  const drsLevels = getUniqueDrsLevels();
  const evcModes = getUniqueEvcModes();
  const updateMethods = getUniqueUpdateMethods();
  const totalClusters = clusters.length;

  return (
    <div className="vsphere-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">vSphere Clusters</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', color: '#7f8c8d' }}>
            View cluster-level infrastructure information
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            className="btn"
            onClick={exportToCSV}
            disabled={loading || filteredClusters.length === 0}
            style={{ backgroundColor: '#27ae60', color: 'white' }}
            title="Export filtered clusters to CSV"
          >
            📥 Export CSV
          </button>
          {hasPermission('config') && (
            <Link 
              to="/vcenter-config"
              className="btn"
              style={{ backgroundColor: '#95a5a6', color: 'white', textDecoration: 'none', display: 'inline-block' }}
              title="Configure vCenter connections"
            >
              ⚙️ Configuration
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
      {clusters.length > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px'
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{stats.clusters}</div>
            <div style={{ color: '#7f8c8d' }}>Cluster{stats.clusters !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2ecc71' }}>{stats.hosts}</div>
            <div style={{ color: '#7f8c8d' }}>Total Hosts</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f39c12' }}>{stats.vms}</div>
            <div style={{ color: '#7f8c8d' }}>Total VMs</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>{stats.uniqueVersions}</div>
            <div style={{ color: '#7f8c8d' }}>ESXi Versions</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9b59b6' }}>{vcenters.length}</div>
            <div style={{ color: '#7f8c8d' }}>vCenters</div>
          </div>
        </div>
      )}

      {/* Filters */}
      {clusters.length > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          flexWrap: 'wrap', 
          alignItems: 'flex-end',
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#ecf0f1',
          borderRadius: '8px'
        }}>
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
                const count = clusters.filter(c => c.environment === env).length;
                return (
                  <option key={env} value={env}>
                    {env} ({count} clusters)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="vcenter-filter">
              <strong>Filter by vCenter:</strong>
            </label>
            <select
              id="vcenter-filter"
              className="filter-select"
              value={vcenterFilter}
              onChange={(e) => setVcenterFilter(e.target.value)}
            >
              <option value="all">All vCenters</option>
              {vcenters.map(vc => {
                const count = clusters.filter(c => c.vcenter === vc).length;
                return (
                  <option key={vc} value={vc}>
                    {vc} ({count} clusters)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="version-filter">
              <strong>Filter by ESXi Version:</strong>
            </label>
            <select
              id="version-filter"
              className="filter-select"
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
            >
              <option value="all">All Versions</option>
              {versions.map(ver => {
                const count = clusters.filter(c => c.versions.includes(ver)).length;
                return (
                  <option key={ver} value={ver}>
                    {ver} ({count} clusters)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="drs-filter">
              <strong>Filter by DRS Level:</strong>
            </label>
            <select
              id="drs-filter"
              className="filter-select"
              value={drsFilter}
              onChange={(e) => setDrsFilter(e.target.value)}
            >
              <option value="all">All DRS Levels</option>
              {drsLevels.map(level => {
                const count = clusters.filter(c => c.drs_automation === level).length;
                return (
                  <option key={level} value={level}>
                    {level} ({count} clusters)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="ha-filter">
              <strong>Filter by HA Status:</strong>
            </label>
            <select
              id="ha-filter"
              className="filter-select"
              value={haFilter}
              onChange={(e) => setHaFilter(e.target.value)}
            >
              <option value="all">All HA Status</option>
              <option value="enabled">
                Enabled ({clusters.filter(c => c.ha_enabled === true).length} clusters)
              </option>
              <option value="disabled">
                Disabled ({clusters.filter(c => c.ha_enabled === false).length} clusters)
              </option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="evc-filter">
              <strong>Filter by EVC Mode:</strong>
            </label>
            <select
              id="evc-filter"
              className="filter-select"
              value={evcFilter}
              onChange={(e) => setEvcFilter(e.target.value)}
            >
              <option value="all">All EVC Modes</option>
              {evcModes.map(mode => {
                const count = clusters.filter(c => c.evc_mode === mode).length;
                return (
                  <option key={mode} value={mode}>
                    {mode} ({count} clusters)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="update-method-filter">
              <strong>Filter by Update Method:</strong>
            </label>
            <select
              id="update-method-filter"
              className="filter-select"
              value={updateMethodFilter}
              onChange={(e) => setUpdateMethodFilter(e.target.value)}
            >
              <option value="all">All Update Methods</option>
              {updateMethods.map(method => {
                const count = clusters.filter(c => c.update_method === method).length;
                return (
                  <option key={method} value={method}>
                    {method} ({count} clusters)
                  </option>
                );
              })}
            </select>
          </div>

          {(environmentFilter !== 'all' || vcenterFilter !== 'all' || versionFilter !== 'all' || drsFilter !== 'all' || haFilter !== 'all' || evcFilter !== 'all' || updateMethodFilter !== 'all') && (
            <button
              className="btn"
              onClick={() => {
                setEnvironmentFilter('all');
                setVcenterFilter('all');
                setVersionFilter('all');
                setDrsFilter('all');
                setHaFilter('all');
                setEvcFilter('all');
                setUpdateMethodFilter('all');
              }}
              style={{ backgroundColor: '#95a5a6', color: 'white', marginLeft: 'auto' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {clusters.length === 0 ? (
        <div className="empty-state">
          <h3>No Cluster Data Available</h3>
          <p>Click "Pull Now" to collect cluster information from your vCenter servers.</p>
          <p>If you haven't configured any vCenter connections yet, go to <strong>⚙️ÂÃ‚Â vCenter Config</strong> in the navigation to add them.</p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            {stats.clusters !== stats.totalClusters ? (
              <h2 style={{ margin: 0, color: '#2c3e50' }}>
                Showing {stats.clusters} of {stats.totalClusters} clusters
              </h2>
            ) : (
              <h2 style={{ margin: 0, color: '#2c3e50' }}>
                {stats.totalClusters} cluster{stats.totalClusters !== 1 ? 's' : ''} total
              </h2>
            )}
          </div>
          <div className="version-table">
            <div className="table-header">
              <div>Cluster Name</div>
              <div>Environment</div>
              <div>Hosts / VMs / Versions</div>
              <div>Last Updated</div>
            </div>
            {filteredClusters.map((cluster, index) => (
              <div key={index} className="table-row">
                <div className="component-name">
                  {cluster.name}
                  <div className="metadata">
                    <span className="metadata-item">
                      vCenter: {cluster.vcenter}
                    </span>
                  </div>
                  <div className="metadata" style={{ marginTop: '0.25rem' }}>
                    <span className="metadata-item">
                      DRS: {cluster.drs_automation || 'Unknown'}
                    </span>
                    <span className="metadata-item">
                      HA: {cluster.ha_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {cluster.evc_mode && cluster.evc_mode !== 'Disabled' && (
                      <span className="metadata-item">
                        EVC: {cluster.evc_mode}
                      </span>
                    )}
                  </div>
                  <div className="metadata" style={{ marginTop: '0.25rem' }}>
                    <span className="metadata-item" style={{ 
                      fontWeight: 'bold',
                      color: cluster.update_method === 'vLCM' ? '#27ae60' : cluster.update_method === 'VUM' ? '#f39c12' : '#95a5a6'
                    }}>
                      Update: {cluster.update_method || 'Unknown'}
                    </span>
                    {cluster.compliance_status && cluster.compliance_status !== 'N/A' && cluster.compliance_status !== 'Unknown' && (
                      <span className="metadata-item" style={{
                        color: cluster.compliance_status === 'COMPLIANT' ? '#27ae60' : 
                               cluster.compliance_status === 'NON_COMPLIANT' ? '#e74c3c' : '#f39c12'
                      }}>
                        Compliance: {cluster.compliance_status}
                      </span>
                    )}
                    {cluster.lifecycle_details && (
                      <span className="metadata-item" style={{ fontSize: '0.85em', color: '#7f8c8d' }}>
                        {cluster.lifecycle_details}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="environment-tag">{cluster.environment}</span>
                </div>
                <div className="component-name">
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    {cluster.host_count} host{cluster.host_count !== 1 ? 's' : ''} • {cluster.vm_count} VM{cluster.vm_count !== 1 ? 's' : ''}
                  </div>
                  <div className="metadata">
                    {cluster.versions.map((version, idx) => (
                      <span key={idx} className="version-badge" style={{ marginRight: '0.5rem' }}>
                        {version}
                      </span>
                    ))}
                  </div>
                  <div className="metadata" style={{ marginTop: '0.25rem' }}>
                    <span className="metadata-item">
                      Hardware: {cluster.hardware_vendors.join(', ')}
                    </span>
                  </div>
                </div>
                <div className="last-updated">
                  {formatDateTime(cluster.last_updated, userTimezone)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default VSphereClustersPage;
