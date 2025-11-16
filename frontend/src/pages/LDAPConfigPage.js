import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatDate } from '../utils/dateUtils';
import './LDAPConfigPage.css';
import './DataPage.css';

function LDAPConfigPage({ userTimezone = 'UTC' }) {
  const [config, setConfig] = useState({
    enabled: false,
    server: '',
    port: 389,
    use_ssl: false,
    base_dn: '',
    bind_dn: '',
    bind_password: '',
    user_search_filter: '(sAMAccountName={username})',
    user_search_base: '',
    group_search_base: '',
    group_membership_attribute: 'memberOf'
  });
  
  const [mappings, setMappings] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGroupSearch, setShowGroupSearch] = useState(false);
  const [groupSearchPattern, setGroupSearchPattern] = useState('*');
  const [searchResults, setSearchResults] = useState([]);
  const [newMapping, setNewMapping] = useState({ ldap_group_dn: '', site_role: 'Read-only' });

  useEffect(() => {
    loadConfig();
    loadMappings();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await axios.get('/api/ldap/config');
      if (response.data.configured) {
        setConfig(prevConfig => ({
          ...prevConfig,
          ...response.data
        }));
      }
    } catch (error) {
      console.error('Error loading LDAP config:', error);
      setStatus({ type: 'error', message: 'Failed to load LDAP configuration' });
    } finally {
      setLoading(false);
    }
  };

  const loadMappings = async () => {
    try {
      const response = await axios.get('/api/ldap/mappings');
      setMappings(response.data.mappings);
    } catch (error) {
      console.error('Error loading group mappings:', error);
    }
  };

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveConfig = async () => {
    try {
      setStatus({ type: 'info', message: 'Saving configuration...' });
      const response = await axios.post('/api/ldap/config', config);
      
      if (response.data.success) {
        setStatus({ type: 'success', message: 'LDAP configuration saved successfully' });
        setTimeout(() => setStatus(null), 3000);
      }
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.error || 'Failed to save configuration' 
      });
    }
  };

  const handleTestConnection = async () => {
    try {
      setStatus({ type: 'info', message: 'Testing LDAP connection...' });
      const response = await axios.post('/api/ldap/test');
      
      setStatus({ 
        type: response.data.success ? 'success' : 'error',
        message: response.data.message 
      });
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.error || 'Connection test failed' 
      });
    }
  };

  const handleSearchGroups = async () => {
    try {
      setStatus({ type: 'info', message: 'Searching for groups...' });
      const response = await axios.post('/api/ldap/groups/search', {
        pattern: groupSearchPattern
      });
      
      setSearchResults(response.data.groups);
      setStatus({ type: 'success', message: `Found ${response.data.groups.length} groups` });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: 'Failed to search groups' 
      });
    }
  };

  const handleAddMapping = async () => {
    if (!newMapping.ldap_group_dn) {
      setStatus({ type: 'error', message: 'Please select an LDAP group' });
      return;
    }

    try {
      const response = await axios.post('/api/ldap/mappings', newMapping);
      
      if (response.data.success) {
        setStatus({ type: 'success', message: 'Group mapping added successfully' });
        loadMappings();
        setNewMapping({ ldap_group_dn: '', site_role: 'Read-only' });
        setShowGroupSearch(false);
        setTimeout(() => setStatus(null), 3000);
      }
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.error || 'Failed to add mapping' 
      });
    }
  };

  const handleDeleteMapping = async (mappingId) => {
    if (!window.confirm('Are you sure you want to delete this group mapping?')) {
      return;
    }

    try {
      await axios.delete(`/api/ldap/mappings/${mappingId}`);
      setStatus({ type: 'success', message: 'Mapping deleted successfully' });
      loadMappings();
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to delete mapping' });
    }
  };

  if (loading) {
    return <div className="loading">Loading LDAP configuration...</div>;
  }

  return (
    <div className="ldap-config-page">
      <div className="page-header">
        <h1>LDAP Configuration</h1>
        <p className="page-description">
          Configure LDAP authentication and map LDAP groups to site roles
        </p>
      </div>

      {status && (
        <div className={`status-message ${status.type}`}>
          {status.message}
        </div>
      )}

      <div className="config-section">
        <h2>LDAP Server Settings</h2>
        
        <div className="form-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleConfigChange('enabled', e.target.checked)}
            />
            <span>Enable LDAP Authentication</span>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="label-text">Server Hostname/IP</span>
            <input
              type="text"
              value={config.server}
              onChange={(e) => handleConfigChange('server', e.target.value)}
              placeholder="ldap.example.com"
            />
          </label>

          <label>
            <span className="label-text">Port</span>
            <input
              type="number"
              value={config.port}
              onChange={(e) => handleConfigChange('port', parseInt(e.target.value))}
              placeholder="389"
            />
          </label>
        </div>

        <div className="form-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.use_ssl}
              onChange={(e) => handleConfigChange('use_ssl', e.target.checked)}
            />
            <span>Use SSL/TLS (LDAPS)</span>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="label-text">Base DN</span>
            <input
              type="text"
              value={config.base_dn}
              onChange={(e) => handleConfigChange('base_dn', e.target.value)}
              placeholder="dc=example,dc=com"
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="label-text">Bind DN (Service Account)</span>
            <input
              type="text"
              value={config.bind_dn}
              onChange={(e) => handleConfigChange('bind_dn', e.target.value)}
              placeholder="cn=service_account,ou=users,dc=example,dc=com"
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="label-text">Bind Password</span>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={config.bind_password}
                onChange={(e) => handleConfigChange('bind_password', e.target.value)}
                placeholder="Service account password"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
        </div>

        <h3>Advanced Settings</h3>

        <div className="form-row">
          <label>
            <span className="label-text">User Search Filter</span>
            <input
              type="text"
              value={config.user_search_filter}
              onChange={(e) => handleConfigChange('user_search_filter', e.target.value)}
              placeholder="(sAMAccountName={username})"
            />
            <span className="help-text">Use {'{username}'} as placeholder for login username</span>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="label-text">User Search Base (optional)</span>
            <input
              type="text"
              value={config.user_search_base}
              onChange={(e) => handleConfigChange('user_search_base', e.target.value)}
              placeholder="ou=users,dc=example,dc=com"
            />
            <span className="help-text">Leave empty to use Base DN</span>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="label-text">Group Search Base (optional)</span>
            <input
              type="text"
              value={config.group_search_base}
              onChange={(e) => handleConfigChange('group_search_base', e.target.value)}
              placeholder="ou=groups,dc=example,dc=com"
            />
            <span className="help-text">Leave empty to use Base DN</span>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="label-text">Group Membership Attribute</span>
            <input
              type="text"
              value={config.group_membership_attribute}
              onChange={(e) => handleConfigChange('group_membership_attribute', e.target.value)}
              placeholder="memberOf"
            />
          </label>
        </div>

        <div className="button-group">
          <button className="btn btn-primary" onClick={handleSaveConfig}>
            Save Configuration
          </button>
          <button className="btn btn-secondary" onClick={handleTestConnection}>
            Test Connection
          </button>
        </div>
      </div>

      <div className="config-section">
        <h2>LDAP Group to Role Mappings</h2>
        <p className="section-description">
          Map LDAP groups to site roles. Users will receive the highest priority role from their group memberships.
        </p>

        <div className="mapping-add-section">
          <h3>Add New Mapping</h3>
          
          {!showGroupSearch ? (
            <div className="form-row">
              <label>
                <span className="label-text">LDAP Group DN</span>
                <input
                  type="text"
                  value={newMapping.ldap_group_dn}
                  onChange={(e) => setNewMapping({ ...newMapping, ldap_group_dn: e.target.value })}
                  placeholder="cn=admins,ou=groups,dc=example,dc=com"
                />
              </label>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowGroupSearch(true)}
              >
                Search Groups
              </button>
            </div>
          ) : (
            <div className="group-search-section">
              <div className="form-row">
                <label>
                  <span className="label-text">Search Pattern</span>
                  <input
                    type="text"
                    value={groupSearchPattern}
                    onChange={(e) => setGroupSearchPattern(e.target.value)}
                    placeholder="*"
                  />
                </label>
                <button className="btn btn-secondary" onClick={handleSearchGroups}>
                  Search
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowGroupSearch(false)}
                >
                  Cancel
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="search-results">
                  <h4>Search Results:</h4>
                  <ul className="group-list">
                    {searchResults.map((group, index) => (
                      <li 
                        key={index}
                        className="group-item"
                        onClick={() => {
                          setNewMapping({ ...newMapping, ldap_group_dn: group.dn });
                          setShowGroupSearch(false);
                        }}
                      >
                        <strong>{group.cn}</strong>
                        <br />
                        <span className="group-dn">{group.dn}</span>
                        {group.description && <br />}
                        {group.description && <span className="group-description">{group.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="form-row">
            <label>
              <span className="label-text">Site Role</span>
              <select
                value={newMapping.site_role}
                onChange={(e) => setNewMapping({ ...newMapping, site_role: e.target.value })}
              >
                <option value="Admin">Admin</option>
                <option value="Support">Support</option>
                <option value="Read-only">Read-only</option>
              </select>
            </label>
          </div>

          <button 
            className="btn btn-primary" 
            onClick={handleAddMapping}
            disabled={!newMapping.ldap_group_dn}
          >
            Add Mapping
          </button>
        </div>

        <div className="mappings-table-container">
          <table className="mappings-table">
            <thead>
              <tr>
                <th>LDAP Group DN</th>
                <th>Site Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan="4" className="no-data">
                    No group mappings configured. Add a mapping to get started.
                  </td>
                </tr>
              ) : (
                mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className="group-dn-cell">{mapping.ldap_group_dn}</td>
                    <td>
                      <span className={`role-badge role-${mapping.site_role.toLowerCase()}`}>
                        {mapping.site_role}
                      </span>
                    </td>
                    <td>{formatDate(mapping.created_at, userTimezone)}</td>
                    <td>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteMapping(mapping.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="info-box">
          <h4>Role Priority</h4>
          <p>If a user is a member of multiple mapped groups, they will receive the highest priority role:</p>
          <ul>
            <li><strong>Admin</strong> (highest) - Full configuration access</li>
            <li><strong>Support</strong> - Can pull data manually and view all information</li>
            <li><strong>Read-only</strong> (lowest) - View-only access</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default LDAPConfigPage;
