import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './UserPreferencesPage.css';
import './DataPage.css';

function UserPreferencesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [timezone, setTimezone] = useState('UTC');
  const [darkMode, setDarkMode] = useState(false);
  const [timezones, setTimezones] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPreferences();
    fetchTimezones();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await axios.get('/api/user/preferences');
      setTimezone(response.data.timezone || 'UTC');
      setDarkMode(response.data.dark_mode || false);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      setMessage({ type: 'error', text: 'Failed to load preferences' });
      setLoading(false);
    }
  };

  const fetchTimezones = async () => {
    try {
      const response = await axios.get('/api/timezones');
      setTimezones(response.data);
    } catch (error) {
      console.error('Error fetching timezones:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await axios.put('/api/user/preferences', { 
        timezone,
        dark_mode: darkMode 
      });

      if (response.data.success) {
        setMessage({ type: 'success', text: 'Preferences saved successfully!' });
        setTimeout(() => {
          setMessage(null);
          // Reload the page to apply dark mode
          window.location.reload();
        }, 1000);
      } else {
        setMessage({ type: 'error', text: response.data.error || 'Failed to save preferences' });
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  };

  const getCurrentTime = () => {
    try {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
      return formatter.format(date);
    } catch (error) {
      return 'Invalid timezone';
    }
  };

  const filterTimezones = () => {
    if (!searchTerm) return timezones;
    
    const filtered = {};
    const search = searchTerm.toLowerCase();
    
    Object.keys(timezones).forEach(region => {
      const matches = timezones[region].filter(tz => 
        tz.toLowerCase().includes(search)
      );
      if (matches.length > 0) {
        filtered[region] = matches;
      }
    });
    
    return filtered;
  };

  if (loading) {
    return (
      <div className="preferences-page">
        <div className="preferences-header">
          <button onClick={() => navigate('/settings')} className="back-button">
            Back to Settings
          </button>
          <h1>User Preferences</h1>
        </div>
        <div className="loading">Loading preferences...</div>
      </div>
    );
  }

  const filteredTimezones = filterTimezones();

  return (
    <div className="preferences-page">
      <div className="preferences-header">
        <button onClick={() => navigate('/settings')} className="back-button">
          Back to Settings
        </button>
        <h1>User Preferences</h1>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="preferences-content">
        <div className="preference-section">
          <h2>Appearance</h2>
          <p className="section-description">
            Choose your preferred color scheme for the application interface.
          </p>
          
          <div className="dark-mode-toggle">
            <label className="toggle-container">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">
                {darkMode ? 'Dark Mode Enabled' : 'Light Mode Enabled'}
              </span>
            </label>
            <p className="toggle-description">
              {darkMode 
                ? 'Using dark theme with reduced brightness for comfortable viewing in low-light environments.' 
                : 'Using light theme with standard brightness for optimal daytime viewing.'}
            </p>
          </div>
        </div>

        <div className="preference-section">
          <h2>Time Zone</h2>
          <p className="section-description">
            Select your local time zone. All timestamps throughout the application will be displayed in your selected time zone.
          </p>

          <div className="timezone-preview">
            <div className="preview-label">Current Time in Selected Zone:</div>
            <div className="preview-time">{getCurrentTime()}</div>
          </div>

          <div className="timezone-search">
            <input
              type="text"
              placeholder="Search time zones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="timezone-groups">
            {Object.keys(filteredTimezones).length === 0 ? (
              <div className="no-results">No time zones found matching "{searchTerm}"</div>
            ) : (
              Object.keys(filteredTimezones).map(region => (
                <div key={region} className="timezone-group">
                  <h3>{region}</h3>
                  <div className="timezone-options">
                    {filteredTimezones[region].map(tz => (
                      <label key={tz} className="timezone-option">
                        <input
                          type="radio"
                          name="timezone"
                          value={tz}
                          checked={timezone === tz}
                          onChange={(e) => setTimezone(e.target.value)}
                        />
                        <span className="timezone-label">{tz}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="preferences-actions">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="save-button"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserPreferencesPage;
