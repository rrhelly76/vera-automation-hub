import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import axios from 'axios';
import { formatDateTime } from '../utils/dateUtils';
import './DataPage.css';

function DashboardPage({ technologies, syncStatus, userTimezone = 'UTC' }) {
  const { hasPermission } = useAuth();
  const [stats, setStats] = useState({
    vsphere: { vcenters: 0, hosts: 0, vms: 0, clusters: 0 },
    nsx: { managers: 0, edges: 0, hosts: 0 },
    vcd: { instances: 0, orgs: 0, cells: 0, activeCells: 0 },
    usageMeter: { instances: 0, products: 0 }
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load vSphere stats
      const vsphereResponse = await axios.get('/api/versions/vsphere');
      const vsphereData = vsphereResponse.data;
      const vcenters = vsphereData.filter(v => v.metadata.type === 'vcenter');
      const hosts = vsphereData.filter(v => v.metadata.type === 'esxi');
      const clusters = vsphereData.filter(v => v.metadata.type === 'cluster');
      
      // Calculate total VMs from all hosts
      const totalVMs = hosts.reduce((sum, h) => sum + (h.metadata.vm_count || 0), 0);

      // Load NSX stats - note: types are 'nsx-manager', 'edge-node', 'host-transport-node'
      const nsxResponse = await axios.get('/api/versions/nsx-t');
      const nsxData = nsxResponse.data;
      const managers = nsxData.filter(v => v.metadata.type === 'nsx-manager');
      const edges = nsxData.filter(v => v.metadata.type === 'edge-node');
      const nsxHosts = nsxData.filter(v => v.metadata.type === 'host-transport-node');

      // Load vCD stats - note: type is 'vcd-instance'
      const vcdResponse = await axios.get('/api/versions/vcd');
      const vcdData = vcdResponse.data;
      const vcdInstances = vcdData.filter(v => v.metadata.type === 'vcd-instance');
      const totalOrgs = vcdInstances.reduce((sum, v) => sum + (v.metadata.org_count || 0), 0);
      
      // Calculate cell counts
      const totalCells = vcdInstances.reduce((sum, v) => {
        const cells = v.metadata.cells || [];
        return sum + cells.length;
      }, 0);
      
      const totalActiveCells = vcdInstances.reduce((sum, v) => {
        const cells = v.metadata.cells || [];
        return sum + cells.filter(c => c.is_active).length;
      }, 0);

      // Load Usage Meter stats - note: types are 'usage-meter' and 'monitored-product'
      const umResponse = await axios.get('/api/versions/usage-meter');
      const umData = umResponse.data;
      const meters = umData.filter(v => v.metadata.type === 'usage-meter');
      const products = umData.filter(v => v.metadata.type === 'monitored-product');

      setStats({
        vsphere: { 
          vcenters: vcenters.length, 
          hosts: hosts.length, 
          vms: totalVMs,
          clusters: clusters.length 
        },
        nsx: { 
          managers: managers.length, 
          edges: edges.length, 
          hosts: nsxHosts.length 
        },
        vcd: { 
          instances: vcdInstances.length, 
          orgs: totalOrgs,
          cells: totalCells,
          activeCells: totalActiveCells
        },
        usageMeter: { 
          instances: meters.length, 
          products: products.length 
        }
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const techCards = [
    {
      id: 'vsphere',
      name: 'vSphere Infrastructure',
      route: '/vsphere-landing',
      icon: 'Server',
      color: '#2196f3',
      stats: [
        { label: 'vCenter Servers', value: stats.vsphere.vcenters },
        { label: 'ESXi Hosts', value: stats.vsphere.hosts },
        { label: 'Clusters', value: stats.vsphere.clusters },
        { label: 'Virtual Machines', value: stats.vsphere.vms }
      ]
    },
    {
      id: 'nsx-t',
      name: 'NSX-T Networking',
      route: '/nsx-t',
      icon: 'Network',
      color: '#9c27b0',
      stats: [
        { label: 'NSX Managers', value: stats.nsx.managers },
        { label: 'Edge Nodes', value: stats.nsx.edges },
        { label: 'Host Nodes', value: stats.nsx.hosts }
      ]
    },
    {
      id: 'vcd',
      name: 'vCloud Director',
      route: '/vcd',
      icon: 'Cloud',
      color: '#4caf50',
      stats: [
        { label: 'vCD Instances', value: stats.vcd.instances },
        { label: 'Organizations', value: stats.vcd.orgs },
        { label: 'Active Cells', value: `${stats.vcd.activeCells}/${stats.vcd.cells}` }
      ]
    },
    {
      id: 'usage-meter',
      name: 'Usage Meter',
      route: '/usage-meter',
      icon: 'Chart',
      color: '#ff9800',
      stats: [
        { label: 'Meter Instances', value: stats.usageMeter.instances },
        { label: 'Tracked Products', value: stats.usageMeter.products }
      ]
    }
  ];

  const comingSoonTech = [
    {
      name: 'Cisco UCS',
      description: 'Monitor Cisco UCS Manager and fabric interconnects for compute infrastructure tracking.',
      color: '#00bceb',
      icon: 'Server'
    },
    {
      name: 'Zerto',
      description: 'Track Zerto Virtual Replication versions for disaster recovery and business continuity.',
      color: '#ff6b35',
      icon: 'Repeat'
    },
    {
      name: 'Veeam',
      description: 'Monitor Veeam Backup & Replication servers and proxy infrastructure.',
      color: '#00b336',
      icon: 'Database'
    },
    {
      name: 'Storage',
      description: 'Track storage array versions across NetApp, Pure Storage, Dell EMC, and other vendors.',
      color: '#7e57c2',
      icon: 'HardDrive'
    }
  ];

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 className="page-title">Infrastructure Version Control Dashboard</h1>
      </div>

      <p style={{ marginBottom: '2rem', color: '#7f8c8d' }}>
        Monitor and track versions across your entire cloud infrastructure. 
        Click on a technology below to view detailed version information.
      </p>

      <div className="dashboard-grid">
        {techCards.map(tech => {
          const status = syncStatus[tech.id];
          const hasData = tech.stats.some(s => {
            // Handle both numeric values and string values like "X/Y"
            const value = s.value;
            if (typeof value === 'string') {
              // For "X/Y" format, check if X > 0
              const match = value.match(/^(\d+)\//);
              return match && parseInt(match[1]) > 0;
            }
            return value > 0;
          });
          
          return (
            <Link
              key={tech.id}
              to={tech.route}
              className="tech-card"
              style={{ borderTop: `4px solid ${tech.color}` }}
            >
              <h2>{tech.name}</h2>
              
              {hasData ? (
                <div className="tech-stats">
                  {tech.stats.map((stat, idx) => (
                    <div key={idx} className="stat-row">
                      <span className="stat-label">{stat.label}:</span>
                      <span className="stat-value">{stat.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: '1rem' }}>
                  <span className="status disabled">
                    No Data - Configure to Start
                  </span>
                </div>
              )}
              
              {status && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ecf0f1' }}>
                  <div style={{ fontSize: '0.85rem', color: '#7f8c8d' }}>
                    Last Sync: {formatDateTime(status.last_sync_time, userTimezone)}
                  </div>
                  <div style={{ 
                    marginTop: '0.5rem',
                    fontSize: '0.85rem',
                    color: status.status === 'success' ? '#27ae60' : '#e74c3c'
                  }}>
                    {status.status === 'success' ? 'Success' : 'Error'}
                    {status.message && ` - ${status.message}`}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div style={{ 
        marginTop: '2rem', 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1rem'
      }}>
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#e3f2fd',
          borderLeft: '4px solid #2196f3',
          borderRadius: '4px'
        }}>
          <strong>vSphere Infrastructure</strong>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Track vCenter servers and ESXi host versions with hardware details, cluster information, and environment tags.
          </p>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f3e5f5',
          borderLeft: '4px solid #9c27b0',
          borderRadius: '4px'
        }}>
          <strong>NSX-T Networking</strong>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Monitor NSX-T Managers, Edge Nodes, and Host Transport Nodes across your software-defined networking infrastructure.
          </p>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: '#e8f5e9',
          borderLeft: '4px solid #4caf50',
          borderRadius: '4px'
        }}>
          <strong>vCloud Director</strong>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Track vCD instances, versions, organization counts, and application cell health for your cloud service delivery platform.
          </p>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: '#fff3e0',
          borderLeft: '4px solid #ff9800',
          borderRadius: '4px'
        }}>
          <strong>Usage Meter</strong>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Monitor Usage Meter instances and all products being tracked for vSphere license compliance.
          </p>
        </div>
      </div>

      {/* Coming Soon Section */}
      <div style={{ 
        marginTop: '3rem', 
        padding: '2rem', 
        backgroundColor: 'white', 
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>Coming Soon</h2>
        <p style={{ marginBottom: '1.5rem', color: '#7f8c8d' }}>
          Future technology integrations planned for the platform
        </p>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem'
        }}>
          {comingSoonTech.map((tech, index) => (
            <div
              key={index}
              style={{
                padding: '1.5rem',
                backgroundColor: '#f8f9fa',
                borderLeft: `4px solid ${tech.color}`,
                borderRadius: '4px',
                opacity: 0.8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1.1rem' }}>{tech.name}</strong>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  borderRadius: '4px'
                }}>
                  Planned
                </span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#7f8c8d', margin: 0 }}>
                {tech.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ 
        marginTop: '2rem', 
        padding: '2rem', 
        backgroundColor: 'white', 
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>Features</h2>
        <ul style={{ lineHeight: '2', color: '#7f8c8d' }}>
          <li>Real-time version tracking across all infrastructure components</li>
          <li>Automatic daily synchronization at 2:00 AM</li>
          <li>Manual "Pull Now" feature for immediate updates</li>
          <li>Version history tracking for compliance and auditing</li>
          <li>Separate pages for each technology stack</li>
          <li>Secure credential management via configuration pages</li>
          <li>CSV export functionality for reporting</li>
          <li>Environment tagging and filtering</li>
        </ul>
      </div>
    </div>
  );
}

export default DashboardPage;
