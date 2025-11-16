import React from 'react';
import { Link } from 'react-router-dom';
import './VSphereLandingPage.css';
import './DataPage.css';

function VSphereLandingPage() {
  return (
    <div className="vsphere-landing-page">
      <div className="vsphere-landing-header">
        <h1>vSphere Infrastructure</h1>
        <p>View and manage vCenter servers, ESXi hosts, and cluster configurations</p>
      </div>

      <div className="vsphere-landing-cards">
        <Link to="/vcenters" className="vsphere-landing-card">
          <div className="vsphere-landing-card-icon">🏢</div>
          <h2>vCenter Servers</h2>
          <p>View all vCenter server instances with version information and build numbers</p>
          <span className="vsphere-landing-card-arrow">→</span>
        </Link>

        <Link to="/vsphere" className="vsphere-landing-card">
          <div className="vsphere-landing-card-icon">🖥️</div>
          <h2>ESXi Hosts</h2>
          <p>Monitor ESXi host versions, hardware details, and virtual machine counts</p>
          <span className="vsphere-landing-card-arrow">→</span>
        </Link>

        <Link to="/vsphere-clusters" className="vsphere-landing-card">
          <div className="vsphere-landing-card-icon">📊</div>
          <h2>Clusters</h2>
          <p>View cluster organization, DRS/HA status, and host membership</p>
          <span className="vsphere-landing-card-arrow">→</span>
        </Link>
      </div>
    </div>
  );
}

export default VSphereLandingPage;
