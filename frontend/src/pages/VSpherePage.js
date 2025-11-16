import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import VersionHistory from '../components/VersionHistory';
import './DataPage.css';

function VSpherePage({ onRefresh }) {
  const { hasPermission } = useAuth();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [message, setMessage] = useState(null);
  const [environmentFilter, setEnvironmentFilter] = useState([]);
  const [clusterFilter, setClusterFilter] = useState([]);
  const [vendorFilter, setVendorFilter] = useState([]);
  const [vcenterFilter, setVcenterFilter] = useState([]);
  const [modelFilter, setModelFilter] = useState([]);
  const [versionFilter, setVersionFilter] = useState([]);
  const [buildFilter, setBuildFilter] = useState([]);
  const [buildFilterMode, setBuildFilterMode] = useState('is'); // 'is' or 'not'
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/versions/vsphere');
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
      
      const response = await axios.post('/api/pull/vsphere');
      
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
    if (environmentFilter.length > 0) {
      hosts = hosts.filter(h => environmentFilter.includes(h.metadata.environment));
    }
    
    // Apply cluster filter
    if (clusterFilter.length > 0) {
      hosts = hosts.filter(h => clusterFilter.includes(h.metadata.cluster));
    }
    
    // Apply vendor filter
    if (vendorFilter.length > 0) {
      hosts = hosts.filter(h => vendorFilter.includes(h.metadata.hardware_vendor));
    }
    
    // Apply vCenter filter
    if (vcenterFilter.length > 0) {
      hosts = hosts.filter(h => vcenterFilter.includes(h.metadata.vcenter));
    }
    
    // Apply hardware model filter
    if (modelFilter.length > 0) {
      hosts = hosts.filter(h => modelFilter.includes(h.metadata.hardware_model));
    }
    
    // Apply ESXi version filter
    if (versionFilter.length > 0) {
      hosts = hosts.filter(h => versionFilter.includes(h.version));
    }
    
    // Apply ESXi build number filter
    if (buildFilter.length > 0) {
      if (buildFilterMode === 'is') {
        // Show hosts WITH these builds
        hosts = hosts.filter(h => buildFilter.includes(h.metadata.build));
      } else {
        // Show hosts NOT on these builds (for patching identification)
        hosts = hosts.filter(h => !buildFilter.includes(h.metadata.build));
      }
    }
    
    return { vcenters, hosts };
  };

  const toggleFilter = (filterArray, setFilter, value) => {
    if (filterArray.includes(value)) {
      setFilter(filterArray.filter(item => item !== value));
    } else {
      setFilter([...filterArray, value]);
    }
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
      'VM Count',
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
      host.metadata.vm_count || 0,
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
    if (environmentFilter.length > 0) filename += `-${environmentFilter.join('-')}`;
    if (clusterFilter.length > 0) filename += `-${clusterFilter.join('-')}`;
    if (vcenterFilter.length > 0) filename += `-${vcenterFilter.join('-')}`;
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
  
  // Calculate total VMs across all hosts
  const totalVMs = versions
    .filter(v => v.metadata.type === 'esxi')
    .reduce((sum, host) => sum + (host.metadata.vm_count || 0), 0);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading vSphere version data...</p>
      </div>
    );
  }

  return (
    <div className="vsphere-page">
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
          {hasPermission('config') && (
            <Link 
              to="/vcenter-config"
              className="btn"
              style={{ backgroundColor: '#95a5a6', color: 'white', textDecoration: 'none', display: 'inline-block' }}
              title="Configure vCenter connections"
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

      {/* Count Summary Section */}
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
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{vcenters.length}</div>
            <div style={{ color: '#7f8c8d' }}>vCenter Servers</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>{totalHosts}</div>
            <div style={{ color: '#7f8c8d' }}>Total ESXi Hosts</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f39c12' }}>{totalVMs}</div>
            <div style={{ color: '#7f8c8d' }}>Total VMs</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>{hosts.length}</div>
            <div style={{ color: '#7f8c8d' }}>Filtered Hosts</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9b59b6' }}>{clusters.length}</div>
            <div style={{ color: '#7f8c8d' }}>Unique Clusters</div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      {versions.length > 0 && (
        <div className="filters-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <button
              className="btn"
              onClick={() => setShowFilters(!showFilters)}
              style={{ backgroundColor: '#3498db', color: 'white' }}
            >
              {showFilters ? '▼ Hide Filters' : '▶ Show Filters'}
              {(environmentFilter.length > 0 || clusterFilter.length > 0 || vendorFilter.length > 0 || vcenterFilter.length > 0 || modelFilter.length > 0 || versionFilter.length > 0 || buildFilter.length > 0) && 
                ` (${environmentFilter.length + clusterFilter.length + vendorFilter.length + vcenterFilter.length + modelFilter.length + versionFilter.length + buildFilter.length} active)`
              }
            </button>
            {(environmentFilter.length > 0 || clusterFilter.length > 0 || vendorFilter.length > 0 || vcenterFilter.length > 0 || modelFilter.length > 0 || versionFilter.length > 0 || buildFilter.length > 0) && (
              <button
                className="btn"
                onClick={() => {
                  setEnvironmentFilter([]);
                  setClusterFilter([]);
                  setVendorFilter([]);
                  setVcenterFilter([]);
                  setModelFilter([]);
                  setVersionFilter([]);
                  setBuildFilter([]);
                  setBuildFilterMode('is');
                }}
                style={{ backgroundColor: '#95a5a6', color: 'white' }}
              >
                Clear All Filters
              </button>
            )}
          </div>

          {showFilters && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              
              {/* vCenter Filter */}
              <div className="filter-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                  vCenter {vcenterFilter.length > 0 && `(${vcenterFilter.length})`}
                </label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', backgroundColor: 'white' }}>
                  {vcenterList.map(vcenter => {
                    const count = versions.filter(v => 
                      v.metadata.type === 'esxi' && v.metadata.vcenter === vcenter
                    ).length;
                    return (
                      <label key={vcenter} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={vcenterFilter.includes(vcenter)}
                          onChange={() => toggleFilter(vcenterFilter, setVcenterFilter, vcenter)}
                        />
                        <span>{vcenter} ({count})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Environment Filter */}
              <div className="filter-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                  Environment {environmentFilter.length > 0 && `(${environmentFilter.length})`}
                </label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', backgroundColor: 'white' }}>
                  {environments.map(env => {
                    const count = versions.filter(v => 
                      v.metadata.type === 'esxi' && v.metadata.environment === env
                    ).length;
                    return (
                      <label key={env} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={environmentFilter.includes(env)}
                          onChange={() => toggleFilter(environmentFilter, setEnvironmentFilter, env)}
                        />
                        <span>{env} ({count})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Cluster Filter */}
              <div className="filter-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                  Cluster {clusterFilter.length > 0 && `(${clusterFilter.length})`}
                </label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', backgroundColor: 'white' }}>
                  {clusters.map(cluster => {
                    const count = versions.filter(v => 
                      v.metadata.type === 'esxi' && v.metadata.cluster === cluster
                    ).length;
                    return (
                      <label key={cluster} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={clusterFilter.includes(cluster)}
                          onChange={() => toggleFilter(clusterFilter, setClusterFilter, cluster)}
                        />
                        <span>{cluster} ({count})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ESXi Version Filter */}
              <div className="filter-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                  ESXi Version {versionFilter.length > 0 && `(${versionFilter.length})`}
                </label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', backgroundColor: 'white' }}>
                  {esxiVersions.map(ver => {
                    const count = versions.filter(v => 
                      v.metadata.type === 'esxi' && v.version === ver
                    ).length;
                    return (
                      <label key={ver} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={versionFilter.includes(ver)}
                          onChange={() => toggleFilter(versionFilter, setVersionFilter, ver)}
                        />
                        <span>{ver} ({count})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ESXi Build Filter */}
              <div className="filter-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                  ESXi Build {buildFilter.length > 0 && `(${buildFilter.length})`}
                </label>
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                    <input 
                      type="radio" 
                      name="buildMode" 
                      value="is" 
                      checked={buildFilterMode === 'is'}
                      onChange={(e) => setBuildFilterMode(e.target.value)}
                    />
                    WITH builds
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                    <input 
                      type="radio" 
                      name="buildMode" 
                      value="not" 
                      checked={buildFilterMode === 'not'}
                      onChange={(e) => setBuildFilterMode(e.target.value)}
                    />
                    NOT on builds
                  </label>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', backgroundColor: 'white' }}>
                  {builds.map(build => {
                    const count = versions.filter(v => 
                      v.metadata.type === 'esxi' && v.metadata.build === build
                    ).length;
                    return (
                      <label key={build} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={buildFilter.includes(build)}
                          onChange={() => toggleFilter(buildFilter, setBuildFilter, build)}
                        />
                        <span>Build {build} ({count})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Hardware Vendor Filter */}
              <div className="filter-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                  Hardware Vendor {vendorFilter.length > 0 && `(${vendorFilter.length})`}
                </label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', backgroundColor: 'white' }}>
                  {vendors.map(vendor => {
                    const count = versions.filter(v => 
                      v.metadata.type === 'esxi' && v.metadata.hardware_vendor === vendor
                    ).length;
                    return (
                      <label key={vendor} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={vendorFilter.includes(vendor)}
                          onChange={() => toggleFilter(vendorFilter, setVendorFilter, vendor)}
                        />
                        <span>{vendor} ({count})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Hardware Model Filter */}
              <div className="filter-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                  Hardware Model {modelFilter.length > 0 && `(${modelFilter.length})`}
                </label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', backgroundColor: 'white' }}>
                  {models.map(model => {
                    const count = versions.filter(v => 
                      v.metadata.type === 'esxi' && v.metadata.hardware_model === model
                    ).length;
                    return (
                      <label key={model} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={modelFilter.includes(model)}
                          onChange={() => toggleFilter(modelFilter, setModelFilter, model)}
                        />
                        <span>{model} ({count})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {versions.length === 0 ? (
        <div className="empty-state">
          <h3>No Version Data Available</h3>
              {pulling ? '🔄 Pulling...' : '🔄 Pull Now'}
          <p>If you haven't configured any vCenter connections yet, go to <strong>⚙️ vCenter Config</strong> in the navigation to add them.</p>
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
                          🖥️ {item.metadata.hardware_vendor} {item.metadata.hardware_model}
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
                        <span className="metadata-item">
                          VMs: {item.metadata.vm_count || 0}
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
          technology="vsphere"
          onClose={() => setSelectedComponent(null)}
        />
      )}
    </div>
  );
}

export default VSpherePage;
