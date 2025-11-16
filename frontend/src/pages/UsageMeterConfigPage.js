import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DataPage.css';

function UsageMeterConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [formData, setFormData] = useState({
    meter_name: '',
    hostname: '',
    username: '',
    password: '',
    environment: 'Production',
    enabled: true
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/usage-meter-configs');
      setConfigs(response.data);
    } catch (error) {
      console.error('Error loading Usage Meter configurations:', error);
      setMessage({ type: 'error', text: 'Failed to load configurations' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        await axios.put(`/api/usage-meter-configs/${editingId}`, formData);
        setMessage({ type: 'success', text: 'Usage Meter configuration updated successfully' });
      } else {
        await axios.post('/api/usage-meter-configs', formData);
        setMessage({ type: 'success', text: 'Usage Meter configuration created successfully' });
      }
      
      resetForm();
      loadConfigs();
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to save configuration' 
      });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleEdit = (config) => {
    setFormData({
      meter_name: config.meter_name,
      hostname: config.hostname,
      username: config.username,
      password: '',
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
      await axios.delete(`/api/usage-meter-configs/${id}`);
      setMessage({ type: 'success', text: 'Configuration deleted successfully' });
      loadConfigs();
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to delete configuration' 
      });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleTest = async (id, name) => {
    setTestingId(id);
    try {
      const response = await axios.post(`/api/usage-meter-configs/${id}/test`);
      if (response.data.success) {
        setMessage({ type: 'success', text: `Successfully connected to ${name}` });
      } else {
        setMessage({ type: 'error', text: `Connection failed: ${response.data.error}` });
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Connection test failed' 
      });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setTestingId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      meter_name: '',
      hostname: '',
      username: '',
      password: '',
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
        <p>Loading Usage Meter configurations...</p>
      </div>
    );
  }

  return (
    <div className="usage-meter-config-page">
      <div className="page-header">
        <h1 className="page-title">Usage Meter Configuration</h1>
        {!showForm && (
          <button 
            className="btn btn-primary" 
            onClick={() => setShowForm(true)}
          >
            ➕ Add Usage Meter
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
              <h2>{editingId ? 'Edit Usage Meter Configuration' : 'Add New Usage Meter'}</h2>
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
                <label htmlFor="meter_name">Meter Name *</label>
                <input
                  type="text"
                  id="meter_name"
                  value={formData.meter_name}
                  onChange={(e) => setFormData({...formData, meter_name: e.target.value})}
                  placeholder="e.g., Production-UsageMeter"
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
                  value={formData.hostname}
                  onChange={(e) => setFormData({...formData, hostname: e.target.value})}
                  placeholder="e.g., usagemeter.company.com"
                  required
                  className="form-input"
                />
                <small>FQDN or IP address of Usage Meter appliance</small>
              </div>

              <div className="form-group">
                <label htmlFor="username">Username *</label>
                <input
                  type="text"
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  placeholder="e.g., admin"
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input
                  type="password"
                  id="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder={editingId ? "Leave blank to keep current password" : "Enter password"}
                  required={!editingId}
                  className="form-input"
                />
                {editingId && <small>Leave blank to keep existing password</small>}
              </div>

              <div className="form-group">
                <label htmlFor="environment">Environment</label>
                <select
                  id="environment"
                  value={formData.environment}
                  onChange={(e) => setFormData({...formData, environment: e.target.value})}
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
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Enabled (collect data from this Usage Meter)
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
          Configured Usage Meters ({configs.length})
        </h2>

        {configs.length === 0 ? (
          <div className="empty-state">
            <h3>No Usage Meter Configurations</h3>
            <p>Click "Add Usage Meter" to create your first configuration.</p>
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
                <div className="component-name">{config.meter_name}</div>
                <div>{config.hostname}</div>
                <div>{config.username}</div>
                <div>
                  <span className={`version-badge ${config.enabled ? '' : 'disabled-badge'}`}>
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleTest(config.id, config.meter_name)}
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
                    onClick={() => handleDelete(config.id, config.meter_name)}
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
          <li>Usage Meter versions 9.0 and above are supported</li>
          <li>The collector will track the meter version and all monitored products</li>
          <li>Use descriptive names to identify your Usage Meters (e.g., "Prod-UsageMeter")</li>
          <li>Use the "Test" button to verify connectivity before saving</li>
          <li>Disabled configurations won't be included in data collection</li>
        </ul>
      </div>
    </div>
  );
}

export default UsageMeterConfigPage;
