import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DataPage.css';

function VCDConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [testingId, setTestingId] = useState(null);
  
  const [formData, setFormData] = useState({
    vcd_name: '',
    hostname: '',
    username: '',
    password: '',
    org: 'System',
    environment: 'Production',
    enabled: true
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vcd-configs');
      setConfigs(response.data);
    } catch (error) {
      console.error('Error loading configurations:', error);
      setMessage({ type: 'error', text: 'Failed to load vCD configurations' });
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
        await axios.put(`/api/vcd-configs/${editingId}`, formData);
        setMessage({ type: 'success', text: 'vCD configuration updated successfully' });
      } else {
        await axios.post('/api/vcd-configs', formData);
        setMessage({ type: 'success', text: 'vCD configuration created successfully' });
      }
      
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
      vcd_name: config.vcd_name,
      hostname: config.hostname,
      username: config.username,
      password: '',
      org: config.org || 'System',
      environment: config.environment || 'Production',
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
      await axios.delete(`/api/vcd-configs/${id}`);
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
      const response = await axios.post(`/api/vcd-configs/${id}/test`);
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
      vcd_name: '',
      hostname: '',
      username: '',
      password: '',
      org: 'System',
      environment: 'Production',
      enabled: true
    });
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading vCD configurations...</p>
      </div>
    );
  }

  return (
    <div className="vcenter-config-page">
      <div className="page-header">
        <h1 className="page-title">vCloud Director Configuration</h1>
        {!showForm && (
          <button 
            className="btn btn-primary" 
            onClick={() => setShowForm(true)}
          >
            ➕ Add vCD Instance
          </button>
        )}
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {showForm && (
        <div className="config-form-container">
          <div className="config-form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>{editingId ? 'Edit vCD Configuration' : 'Add New vCD Instance'}</h2>
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
                <label htmlFor="vcd_name">vCD Instance Name *</label>
                <input
                  type="text"
                  id="vcd_name"
                  name="vcd_name"
                  value={formData.vcd_name}
                  onChange={handleInputChange}
                  placeholder="e.g., Production-vCD"
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
                  placeholder="e.g., vcd.company.com"
                  required
                  className="form-input"
                />
                <small>FQDN or IP address of vCD instance</small>
              </div>

              <div className="form-group">
                <label htmlFor="username">Username *</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="e.g., administrator"
                  required
                  className="form-input"
                />
                <small>Username (without @org suffix)</small>
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
                <label htmlFor="org">Organization *</label>
                <input
                  type="text"
                  id="org"
                  name="org"
                  value={formData.org}
                  onChange={handleInputChange}
                  placeholder="e.g., System"
                  required
                  className="form-input"
                />
                <small>Organization name (use "System" for system admin)</small>
              </div>

              <div className="form-group">
                <label htmlFor="environment">Environment</label>
                <select
                  id="environment"
                  name="environment"
                  value={formData.environment}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Production">Production</option>
                  <option value="DR">DR</option>
                  <option value="Development">Development</option>
                  <option value="Test">Test</option>
                  <option value="Staging">Staging</option>
                </select>
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
                  Enabled (collect data from this vCD instance)
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

      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
          Configured vCD Instances ({configs.length})
        </h2>

        {configs.length === 0 ? (
          <div className="empty-state">
            <h3>No vCD Configurations</h3>
            <p>Click "Add vCD Instance" to create your first configuration.</p>
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
                <div className="component-name">
                  {config.vcd_name}
                  <div className="metadata">
                    <span className="metadata-item">
                      Org: {config.org}
                    </span>
                    <span className="metadata-item">
                      Env: {config.environment}
                    </span>
                  </div>
                </div>
                <div>{config.hostname}</div>
                <div>{config.username}</div>
                <div>
                  <span className={`version-badge ${config.enabled ? '' : 'disabled-badge'}`}>
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleTest(config.id, config.vcd_name)}
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
                    onClick={() => handleDelete(config.id, config.vcd_name)}
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
          <li>Use descriptive names to easily identify your vCD instances</li>
          <li>Username should NOT include @org suffix - specify organization separately</li>
          <li>For system administrator access, use "System" as the organization</li>
          <li>Credentials are stored securely in the database</li>
          <li>Use the "Test" button to verify connectivity before saving</li>
          <li>Disabled configurations won't be included in data collection</li>
        </ul>
      </div>
    </div>
  );
}

export default VCDConfigPage;
