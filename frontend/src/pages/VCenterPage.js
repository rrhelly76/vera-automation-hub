import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import VersionHistory from '../components/VersionHistory';
import './DataPage.css';

function VCenterPage({ onRefresh }) {
  const { hasPermission } = useAuth();
  const [versions, setVersions] = useState([]);
  const [allVsphereData, setAllVsphereData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/versions/vsphere');
      // Store all vsphere data for stats calculation
      setAllVsphereData(response.data);
      // Filter to show only vCenter servers
      const vcenters = response.data.filter(v => v.metadata.type === 'vcenter');
      setVersions(vcenters);
    } catch (error) {
      console.error('Error loading versions:', error);
      setMessage({ type: 'error', text: 'Failed to load version data' });
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
  const exportToCSV = () => {
    if (versions.length === 0) {
      alert('No vCenter servers to export');
      return;
    }

    // CSV headers
    const headers = [
      'vCenter Name',
      'Version',
      'Build',
      'API Version',
      'Hostname',
      'Host Count',
      'VM Count',
      'Last Updated'
    ];

    // CSV rows
    const rows = versions.map(vcenter => {
      const cleanName = vcenter.component_name.replace(' (vCenter)', '');
      const hostCount = getHostCountForVCenter(vcenter.component_name);
      const vmCount = getVMCountForVCenter(vcenter.component_name);
      
      return [
        cleanName,
        vcenter.version,
        vcenter.metadata.build,
        vcenter.metadata.api_version,
        vcenter.metadata.hostname,
        hostCount,
        vmCount,
        new Date(vcenter.last_updated).toLocaleString()
      ];
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
    
    const filename = `vcenters-${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setMessage({ 
      type: 'success', 
      text: `Exported ${versions.length} vCenter server${versions.length !== 1 ? 's' : ''} to ${filename}` 
    });
    setTimeout(() => setMessage(null), 3000);
  };


  const calculateStats = () => {
    const hosts = allVsphereData.filter(v => v.metadata.type === 'esxi');
    
    // Get unique clusters from host metadata
    const uniqueClusters = new Set();
    hosts.forEach(host => {
      const cluster = host.metadata.cluster;
      if (cluster && cluster !== 'Unknown') {
        uniqueClusters.add(cluster);
      }
    });
    
    // Get unique versions
    const uniqueVersions = new Set();
    allVsphereData.forEach(v => {
      if (v.version && v.version !== 'Unknown') {
        uniqueVersions.add(v.version);
      }
    });
    
    // Calculate total VMs
    const totalVMs = hosts.reduce((sum, host) => {
      return sum + (host.metadata.vm_count || 0);
    }, 0);
    
    return {
      vcenters: versions.length,
      hosts: hosts.length,
      clusters: uniqueClusters.size,
      uniqueVersions: uniqueVersions.size,
      totalVMs: totalVMs
    };
  };

  const getVMCountForVCenter = (vcenterName) => {
    // Extract vCenter name without " (vCenter)" suffix
    const cleanName = vcenterName.replace(' (vCenter)', '');
    
    // Find all hosts for this vCenter
    const hosts = allVsphereData.filter(v => 
      v.metadata.type === 'esxi' && v.metadata.vcenter === cleanName
    );
    
    // Sum up VM counts
    return hosts.reduce((sum, host) => {
      return sum + (host.metadata.vm_count || 0);
    }, 0);
  };

  const getHostCountForVCenter = (vcenterName) => {
    // Extract vCenter name without " (vCenter)" suffix
    const cleanName = vcenterName.replace(' (vCenter)', '');
    
    // Count hosts for this vCenter
    return allVsphereData.filter(v => 
      v.metadata.type === 'esxi' && v.metadata.vcenter === cleanName
    ).length;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading vCenter version data...</p>
      </div>
    );
  }

  return (
    <div className="vcenter-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">vCenter Servers</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', color: '#7f8c8d' }}>
            View and manage vCenter server versions
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            className="btn"
            onClick={exportToCSV}
            disabled={loading || versions.length === 0}
            style={{ backgroundColor: '#27ae60', color: 'white' }}
            title="Export vCenter servers to CSV"
          >
            📥 Export ({versions.length})
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

      {/* Summary Stats */}
      {versions.length > 0 && (() => {
        const stats = calculateStats();
        return (
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px'
          }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{stats.vcenters}</div>
              <div style={{ color: '#7f8c8d' }}>vCenter{stats.vcenters !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2ecc71' }}>{stats.hosts}</div>
              <div style={{ color: '#7f8c8d' }}>ESXi Hosts</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f39c12' }}>{stats.totalVMs}</div>
              <div style={{ color: '#7f8c8d' }}>Total VMs</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>{stats.clusters}</div>
              <div style={{ color: '#7f8c8d' }}>Clusters</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9b59b6' }}>{stats.uniqueVersions}</div>
              <div style={{ color: '#7f8c8d' }}>Unique Versions</div>
            </div>
          </div>
        );
      })()}

      {versions.length === 0 ? (
        <div className="empty-state">
          <h3>No Version Data Available</h3>
          <p>Click "Pull Now" to collect version information from your vCenter servers.</p>
          <p>If you haven't configured any vCenter connections yet, go to <strong>⚙️ vCenter Config</strong> in the navigation to add them.</p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, color: '#2c3e50' }}>
              {versions.length} vCenter Server{versions.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="version-table">
            <div className="table-header">
              <div>vCenter Name</div>
              <div>Version</div>
              <div>Last Updated</div>
              <div>Actions</div>
            </div>
            {versions.map((item, index) => {
              const vmCount = getVMCountForVCenter(item.component_name);
              const hostCount = getHostCountForVCenter(item.component_name);
              return (
              <div key={index} className="table-row">
                <div className="component-name">
                  {item.component_name}
                  <div className="metadata">
                    <span className="metadata-item">
                      Build: {item.metadata.build}
                    </span>
                    <span className="metadata-item">
                      API Version: {item.metadata.api_version}
                    </span>
                  </div>
                  <div className="metadata" style={{ marginTop: '0.25rem' }}>
                    <span className="metadata-item">
                      Hostname: {item.metadata.hostname}
                    </span>
                  </div>
                  <div className="metadata" style={{ marginTop: '0.25rem' }}>
                    <span className="metadata-item">
                      {hostCount} host{hostCount !== 1 ? 's' : ''} • {vmCount} VM{vmCount !== 1 ? 's' : ''}
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
              );
            })}
          </div>
        </div>
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

export default VCenterPage;
