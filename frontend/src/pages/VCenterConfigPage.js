import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DataPage.css';

function VCenterConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [testingId, setTestingId] = useState(null);
  
  const [formData, setFormData] = useState({
    vcenter_name: '',
    hostname: '',
    username: '',
    password: '',
    enabled: true
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vcenter-configs');
      setConfigs(response.data);
    } catch (error) {
      console.error('Error loading configurations:', error);
      setMessage({ type: 'error', text: 'Failed to load vCenter configurations' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        // Update existing
        await axios.put(`/api/vcenter-configs/${editingId}`, formData);
        setMessage({ type: 'success', text: 'vCenter configuration updated successfully' });
      } else {
        // Create new
        await axios.post('/api/vcenter-configs', formData);
        setMessage({ type: 'success', text: 'vCenter configuration created successfully' });
      }
      
      // Reset form and reload
      resetForm();
      loadConfigs();
      
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to save configuration';
      setMessage({ type: 'error', text: errorMsg });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleEdit = (config) => {
    setFormData({
      vcenter_name: config.vcenter_name,
      hostname: config.hostname,
      username: config.username,
      password: '', // Don't populate password for security
      enabled: config.enabled
    });
    setEditingId(config.id);
    setShowForm(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the configuration for "${name}"?`)) {
      return;
    }
    
    try {
      await axios.delete(`/api/vcenter-configs/${id}`);
      setMessage({ type: 'success', text: 'Configuration deleted successfully' });
      loadConfigs();
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to delete configuration';
      setMessage({ type: 'error', text: errorMsg });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleTest = async (id, name) => {
    setTestingId(id);
    try {
      const response = await axios.post(`/api/vcenter-configs/${id}/test`);
      if (response.data.success) {
        setMessage({ type: 'success', text: `Successfully connected to ${name}` });
      } else {
        setMessage({ type: 'error', text: `Connection failed: ${response.data.error}` });
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Connection test failed';
      setMessage({ type: 'error', text: errorMsg });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setTestingId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      vcenter_name: '',
      hostname: '',
      username: '',
      password: '',
      enabled: true
    });
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading vCenter configurations...</p>
      </div>
    );
  }

  return (
    <div className="vcenter-config-page">
      <div className="page-header">
        <h1 className="page-title">vCenter Configuration</h1>
        {!showForm && (
          <button 
            className="btn btn-primary" 
            onClick={() => setShowForm(true)}
          >
            ➕ Add vCenter
          </button>
        )}
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Configuration Form */}
      {showForm && (
        <div className="config-form-container">
          <div className="config-form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>{editingId ? 'Edit vCenter Configuration' : 'Add New vCenter'}</h2>
              <button 
                className="modal-close" 
                onClick={resetForm}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="vcenter_name">vCenter Name *</label>
                <input
                  type="text"
                  id="vcenter_name"
                  name="vcenter_name"
                  value={formData.vcenter_name}
                  onChange={handleInputChange}
                  placeholder="e.g., Production-vCenter"
                  required
                  className="form-input"
                />
                <small>Friendly name for identification</small>
              </div>

              <div className="form-group">
                <label htmlFor="hostname">Hostname / IP Address *</label>
                <input
                  type="text"
                  id="hostname"
                  name="hostname"
                  value={formData.hostname}
                  onChange={handleInputChange}
                  placeholder="e.g., vcenter.company.com"
                  required
                  className="form-input"
                />
                <small>FQDN or IP address of vCenter server</small>
              </div>

              <div className="form-group">
                <label htmlFor="username">Username *</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="e.g., administrator@vsphere.local"
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder={editingId ? "Leave blank to keep current password" : "Enter password"}
                  required={!editingId}
                  className="form-input"
                />
                {editingId && <small>Leave blank to keep existing password</small>}
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="enabled"
                    checked={formData.enabled}
                    onChange={handleInputChange}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Enabled (collect data from this vCenter)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="submit" className="btn btn-primary">
                  {editingId ? '💾 Update Configuration' : '➕ Add Configuration'}
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  onClick={resetForm}
                  style={{ backgroundColor: '#95a5a6', color: 'white' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configurations List */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
          Configured vCenters ({configs.length})
        </h2>

        {configs.length === 0 ? (
          <div className="empty-state">
            <h3>No vCenter Configurations</h3>
            <p>Click "Add vCenter" to create your first configuration.</p>
          </div>
        ) : (
          <div className="version-table">
            <div className="table-header" style={{ gridTemplateColumns: '2fr 2fr 2fr 1fr 2fr' }}>
              <div>Name</div>
              <div>Hostname</div>
              <div>Username</div>
              <div>Status</div>
              <div>Actions</div>
            </div>
            
            {configs.map((config) => (
              <div key={config.id} className="table-row" style={{ gridTemplateColumns: '2fr 2fr 2fr 1fr 2fr' }}>
                <div className="component-name">{config.vcenter_name}</div>
                <div>{config.hostname}</div>
                <div>{config.username}</div>
                <div>
                  <span className={`version-badge ${config.enabled ? '' : 'disabled-badge'}`}>
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleTest(config.id, config.vcenter_name)}
                    disabled={testingId === config.id}
                    className="action-button test-button"
                    title="Test Connection"
                  >
                    {testingId === config.id ? '⏳' : '🔌'} Test
                  </button>
                  <button
                    onClick={() => handleEdit(config)}
                    className="action-button edit-button"
                    title="Edit Configuration"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDelete(config.id, config.vcenter_name)}
                    className="action-button delete-button"
                    title="Delete Configuration"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ 
        marginTop: '2rem', 
        padding: '1.5rem', 
        backgroundColor: '#e8f4f8', 
        borderLeft: '4px solid #3498db',
        borderRadius: '4px'
      }}>
        <strong>💡 Configuration Tips:</strong>
        <ul style={{ marginTop: '1rem', lineHeight: '1.8', marginLeft: '1.5rem' }}>
          <li>Use descriptive names to easily identify your vCenters (e.g., "Prod-DC1", "DR-Site")</li>
          <li>Credentials are stored securely in the database</li>
          <li>Use the "Test" button to verify connectivity before saving</li>
          <li>Disabled configurations won't be included in data collection</li>
          <li>Read-only service accounts are recommended for security</li>
        </ul>
      </div>
    </div>
  );
}

export default VCenterConfigPage;
