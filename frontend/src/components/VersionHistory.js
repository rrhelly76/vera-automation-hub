import React, { useState, useEffect } from 'react';
import axios from 'axios';

function VersionHistory({ component, technology, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          `/api/history/${technology}/${encodeURIComponent(component.component_name)}`
        );
        setHistory(response.data);
      } catch (error) {
        console.error('Error loading history:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadHistory();
  }, [component, technology]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Version History: {component.component_name}</h2>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#7f8c8d', fontWeight: 'normal' }}>
              Showing only when version or configuration changed
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <p>No history available for this component.</p>
          </div>
        ) : (
          <div>
            <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px', marginBottom: '1rem' }}>
              <strong>Total changes recorded:</strong> {history.length}
            </div>
            {history.map((item, index) => (
              <div key={index} className="history-item">
                <div className="version">
                  Version: {item.version}
                  {item.metadata && item.metadata.build && (
                    <span style={{ marginLeft: '1rem', fontWeight: 'normal', color: '#7f8c8d' }}>
                      Build: {item.metadata.build}
                    </span>
                  )}
                </div>
                <div className="timestamp">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
                {item.metadata && item.metadata.full_name && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#7f8c8d' }}>
                    {item.metadata.full_name}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default VersionHistory;
