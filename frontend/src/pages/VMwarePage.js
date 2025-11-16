import React, { useState, useEffect } from 'react';
import axios from 'axios';
import VersionHistory from '../components/VersionHistory';
import './DataPage.css';

function VMwarePage({ onRefresh }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [message, setMessage] = useState(null);
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [clusterFilter, setClusterFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [vcenterFilter, setVcenterFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [versionFilter, setVersionFilter] = useState('all');
  const [buildFilter, setBuildFilter] = useState('all');

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/versions/vmware');
      setVersions(response.data);
    } catch (error) {
      console.error('Error loading versions:', error);
      setMessage({ type: 'error', text: 'Failed to load version data' });
    } finally {
      setLoading(false);
    }
  };

  const handlePullNow = async () => {
    // Confirmation dialog
    const confirmed = window.confirm(
      'This action will refresh all data from your vCenter servers.\n\n' +
      'This can take 10+ minutes to run depending on the size of your infrastructure.\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!confirmed) {
      return; // User cancelled
    }
    
    try {
      setPulling(true);
      setMessage({ type: 'success', text: 'Pulling latest data from vCenter...' });
      
      const response = await axios.post('/api/pull/vmware');
      
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
    const vcenters = versions.filter(v => v.metadata.type === 'vcenter');
    let hosts = versions.filter(v => v.metadata.type === 'esxi');
    
    // Apply environment filter
    if (environmentFilter !== 'all') {
      hosts = hosts.filter(h => h.metadata.environment === environmentFilter);
    }
    
    // Apply cluster filter
    if (clusterFilter !== 'all') {
      hosts = hosts.filter(h => h.metadata.cluster === clusterFilter);
    }
    
    // Apply vendor filter
    if (vendorFilter !== 'all') {
      hosts = hosts.filter(h => h.metadata.hardware_vendor === vendorFilter);
    }
    
    // Apply vCenter filter
    if (vcenterFilter !== 'all') {
      hosts = hosts.filter(h => h.metadata.vcenter === vcenterFilter);
    }
    
    // Apply hardware model filter
    if (modelFilter !== 'all') {
      hosts = hosts.filter(h => h.metadata.hardware_model === modelFilter);
    }
    
    // Apply ESXi version filter
    if (versionFilter !== 'all') {
      hosts = hosts.filter(h => h.version === versionFilter);
    }
    
    // Apply ESXi build number filter
    if (buildFilter !== 'all') {
      hosts = hosts.filter(h => h.metadata.build === buildFilter);
    }
    
    return { vcenters, hosts };
  };

  const getUniqueEnvironments = () => {
    const environments = new Set();
    versions
      .filter(v => v.metadata.type === 'esxi')
      .forEach(v => environments.add(v.metadata.environment || 'Untagged'));
    return Array.from(environments).sort();
  };

  const getUniqueClusters = () => {
    const clusters = new Set();
    versions
      .filter(v => v.metadata.type === 'esxi')
      .forEach(v => clusters.add(v.metadata.cluster || 'Unknown'));
    return Array.from(clusters).sort();
  };

  const getUniqueVendors = () => {
    const vendors = new Set();
    versions
      .filter(v => v.metadata.type === 'esxi')
      .forEach(v => vendors.add(v.metadata.hardware_vendor || 'Unknown'));
    return Array.from(vendors).sort();
  };

  const getUniqueVcenters = () => {
    const vcenters = new Set();
    versions
      .filter(v => v.metadata.type === 'esxi')
      .forEach(v => vcenters.add(v.metadata.vcenter || 'Unknown'));
    return Array.from(vcenters).sort();
  };

  const getUniqueModels = () => {
    const models = new Set();
    versions
      .filter(v => v.metadata.type === 'esxi')
      .forEach(v => models.add(v.metadata.hardware_model || 'Unknown'));
    return Array.from(models).sort();
  };

  const getUniqueEsxiVersions = () => {
    const esxiVersions = new Set();
    versions
      .filter(v => v.metadata.type === 'esxi')
      .forEach(v => esxiVersions.add(v.version));
    // Sort versions in reverse order (newest first)
    return Array.from(esxiVersions).sort().reverse();
  };

  const getUniqueBuilds = () => {
    const builds = new Set();
    versions
      .filter(v => v.metadata.type === 'esxi')
      .forEach(v => builds.add(v.metadata.build || 'Unknown'));
    // Sort builds in reverse order (newest first)
    return Array.from(builds).sort((a, b) => {
      // Handle 'Unknown' case
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      // Sort numerically in descending order
      return parseInt(b) - parseInt(a);
    });
  };

  const exportToCSV = () => {
    const { hosts } = groupVersions();
    
    if (hosts.length === 0) {
      alert('No hosts to export with current filters');
      return;
    }

    // CSV headers
    const headers = [
      'Hostname',
      'ESXi Version',
      'Build',
      'vCenter',
      'Environment',
      'Cluster',
      'Hardware Vendor',
      'Hardware Model',
      'Serial Number',
      'Connection State',
      'Power State',
      'Last Updated'
    ];

    // CSV rows
    const rows = hosts.map(host => [
      host.component_name,
      host.version,
      host.metadata.build,
      host.metadata.vcenter,
      host.metadata.environment,
      host.metadata.cluster,
      host.metadata.hardware_vendor,
      host.metadata.hardware_model,
      host.metadata.serial_number,
      host.metadata.connection_state,
      host.metadata.power_state,
      new Date(host.last_updated).toLocaleString()
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
    
    // Generate filename with timestamp and filter info
    let filename = 'esxi-hosts';
    if (environmentFilter !== 'all') filename += `-${environmentFilter}`;
    if (clusterFilter !== 'all') filename += `-${clusterFilter}`;
    if (vcenterFilter !== 'all') filename += `-${vcenterFilter}`;
    filename += `-${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setMessage({ 
      type: 'success', 
      text: `Exported ${hosts.length} host${hosts.length !== 1 ? 's' : ''} to ${filename}` 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const { vcenters, hosts } = groupVersions();
  const environments = getUniqueEnvironments();
  const clusters = getUniqueClusters();
  const vendors = getUniqueVendors();
  const vcenterList = getUniqueVcenters();
  const models = getUniqueModels();
  const esxiVersions = getUniqueEsxiVersions();
  const builds = getUniqueBuilds();
  const totalHosts = versions.filter(v => v.metadata.type === 'esxi').length;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading VMware version data...</p>
      </div>
    );
  }

  return (
    <div className="vmware-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">ESXi Hosts</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', color: '#7f8c8d' }}>
            View and manage ESXi host versions across all vCenters
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            className="btn"
            onClick={exportToCSV}
            disabled={loading || hosts.length === 0}
            style={{ backgroundColor: '#27ae60', color: 'white' }}
            title="Export filtered hosts to CSV"
          >
            📥 Export ({hosts.length})
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handlePullNow}
            disabled={pulling}
          >
            {pulling ? '🔄 Pulling...' : '🔄 Pull Now'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Filters Section */}
      {versions.length > 0 && (
        <div className="filters-container">
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
              {vcenterList.map(vcenter => {
                const count = versions.filter(v => 
                  v.metadata.type === 'esxi' && v.metadata.vcenter === vcenter
                ).length;
                return (
                  <option key={vcenter} value={vcenter}>
                    {vcenter} ({count} hosts)
                  </option>
                );
              })}
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
                const count = versions.filter(v => 
                  v.metadata.type === 'esxi' && v.metadata.environment === env
                ).length;
                return (
                  <option key={env} value={env}>
                    {env} ({count} hosts)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="cluster-filter">
              <strong>Filter by Cluster:</strong>
            </label>
            <select
              id="cluster-filter"
              className="filter-select"
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
            >
              <option value="all">All Clusters</option>
              {clusters.map(cluster => {
                const count = versions.filter(v => 
                  v.metadata.type === 'esxi' && v.metadata.cluster === cluster
                ).length;
                return (
                  <option key={cluster} value={cluster}>
                    {cluster} ({count} hosts)
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
              {esxiVersions.map(ver => {
                const count = versions.filter(v => 
                  v.metadata.type === 'esxi' && v.version === ver
                ).length;
                return (
                  <option key={ver} value={ver}>
                    {ver} ({count} hosts)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="build-filter">
              <strong>Filter by ESXi Build:</strong>
            </label>
            <select
              id="build-filter"
              className="filter-select"
              value={buildFilter}
              onChange={(e) => setBuildFilter(e.target.value)}
            >
              <option value="all">All Builds</option>
              {builds.map(build => {
                const count = versions.filter(v => 
                  v.metadata.type === 'esxi' && v.metadata.build === build
                ).length;
                return (
                  <option key={build} value={build}>
                    Build {build} ({count} hosts)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="vendor-filter">
              <strong>Filter by Hardware Vendor:</strong>
            </label>
            <select
              id="vendor-filter"
              className="filter-select"
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
            >
              <option value="all">All Vendors</option>
              {vendors.map(vendor => {
                const count = versions.filter(v => 
                  v.metadata.type === 'esxi' && v.metadata.hardware_vendor === vendor
                ).length;
                return (
                  <option key={vendor} value={vendor}>
                    {vendor} ({count} hosts)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="model-filter">
              <strong>Filter by Hardware Model:</strong>
            </label>
            <select
              id="model-filter"
              className="filter-select"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <option value="all">All Models</option>
              {models.map(model => {
                const count = versions.filter(v => 
                  v.metadata.type === 'esxi' && v.metadata.hardware_model === model
                ).length;
                return (
                  <option key={model} value={model}>
                    {model} ({count} hosts)
                  </option>
                );
              })}
            </select>
          </div>

          {(environmentFilter !== 'all' || clusterFilter !== 'all' || vendorFilter !== 'all' || vcenterFilter !== 'all' || modelFilter !== 'all' || versionFilter !== 'all' || buildFilter !== 'all') && (
            <button
              className="btn"
              onClick={() => {
                setEnvironmentFilter('all');
                setClusterFilter('all');
                setVendorFilter('all');
                setVcenterFilter('all');
                setModelFilter('all');
                setVersionFilter('all');
                setBuildFilter('all');
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
          <h3>No Version Data Available</h3>
          <p>Click "Pull Now" to collect version information from your vCenter servers.</p>
          <p>If you haven't configured any vCenter connections yet, go to <strong>âš™ï¸ vCenter Config</strong> in the navigation to add them.</p>
        </div>
      ) : (
        <>
          {/* ESXi Hosts Section */}
          {hosts.length > 0 && (
            <div>
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {totalHosts !== hosts.length ? (
                  <h2 style={{ margin: 0, color: '#2c3e50' }}>
                    Showing {hosts.length} of {totalHosts} hosts
                  </h2>
                ) : (
                  <h2 style={{ margin: 0, color: '#2c3e50' }}>
                    {totalHosts} host{totalHosts !== 1 ? 's' : ''} total
                  </h2>
                )}
              </div>
              <div className="version-table">
                <div className="table-header">
                  <div>Host Name</div>
                  <div>Version</div>
                  <div>Last Updated</div>
                  <div>Actions</div>
                </div>
                {hosts.map((item, index) => (
                  <div key={index} className="table-row">
                    <div className="component-name">
                      {item.component_name}
                      <div className="metadata">
                        <span className="metadata-item">
                          Build: {item.metadata.build}
                        </span>
                        <span className="metadata-item">
                          Cluster: {item.metadata.cluster}
                        </span>
                        <span className="metadata-item">
                          Environment: <span className="environment-tag">{item.metadata.environment}</span>
                        </span>
                      </div>
                      <div className="metadata" style={{ marginTop: '0.25rem' }}>
                        <span className="metadata-item hardware-info">
                          🖥️ {item.metadata.hardware_vendor} {item.metadata.hardware_model}
                        </span>
                        {item.metadata.serial_number && item.metadata.serial_number !== 'Unknown' && (
                          <span className="metadata-item hardware-info">
                            S/N: {item.metadata.serial_number}
                          </span>
                        )}
                      </div>
                      <div className="metadata" style={{ marginTop: '0.25rem' }}>
                        <span className="metadata-item">
                          vCenter: {item.metadata.vcenter}
                        </span>
                        <span className="metadata-item">
                          State: {item.metadata.connection_state}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="version-badge">{item.version}</span>
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

      {selectedComponent && (
        <VersionHistory 
          component={selectedComponent}
          technology="vmware"
          onClose={() => setSelectedComponent(null)}
        />
      )}
    </div>
  );
}

export default VMwarePage;
