import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SSLConfigPage.css';
import './DataPage.css';

function SSLConfigPage() {
  const [sslStatus, setSSLStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [message, setMessage] = useState(null);
  const [certFile, setCertFile] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [hostname, setHostname] = useState('localhost');
  const [validityDays, setValidityDays] = useState(365);

  useEffect(() => {
    loadSSLStatus();
  }, []);

  const loadSSLStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/ssl/status');
      setSSLStatus(response.data);
    } catch (error) {
      console.error('Error loading SSL status:', error);
      setMessage({ type: 'error', text: 'Failed to load SSL status' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!certFile || !keyFile) {
      setMessage({ type: 'error', text: 'Please select both certificate and private key files' });
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('certificate', certFile);
    formData.append('private_key', keyFile);

    try {
      const response = await axios.post('/api/ssl/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        setMessage({ type: 'success', text: response.data.message });
        setCertFile(null);
        setKeyFile(null);
        // Reset file inputs
        document.getElementById('certFileInput').value = '';
        document.getElementById('keyFileInput').value = '';
        await loadSSLStatus();
      } else {
        setMessage({ type: 'error', text: response.data.error });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to upload certificate';
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setUploading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('This will replace the current certificate. Continue?')) {
      return;
    }

    setRegenerating(true);
    setMessage(null);

    try {
      const response = await axios.post('/api/ssl/regenerate', {
        hostname,
        validity_days: validityDays
      });

      if (response.data.success) {
        setMessage({ type: 'success', text: response.data.message });
        await loadSSLStatus();
      } else {
        setMessage({ type: 'error', text: response.data.error });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to regenerate certificate';
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setRegenerating(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const isExpiringSoon = () => {
    if (!sslStatus?.expires_at) return false;
    const expiryDate = new Date(sslStatus.expires_at);
    const now = new Date();
    const daysUntilExpiry = (expiryDate - now) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry < 30;
  };

  const isExpired = () => {
    if (!sslStatus?.expires_at) return false;
    const expiryDate = new Date(sslStatus.expires_at);
    return expiryDate < new Date();
  };

  if (loading) {
    return (
      <div className="ssl-config-page">
        <div className="page-header">
          <h1>SSL Certificate Configuration</h1>
        </div>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading SSL configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ssl-config-page">
      <div className="page-header">
        <h1>SSL Certificate Configuration</h1>
        <p className="page-description">
          Manage SSL/TLS certificates for secure HTTPS connections
        </p>
      </div>

      {message && (
        <div className={`message-banner ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Current Status */}
      <div className="config-section">
        <h2>Current Status</h2>
        <div className="status-grid">
          <div className="status-item">
            <label>SSL Enabled:</label>
            <span className={sslStatus?.enabled ? 'status-enabled' : 'status-disabled'}>
              {sslStatus?.enabled ? 'Yes' : 'No'}
            </span>
          </div>
          {sslStatus?.configured && (
            <>
              <div className="status-item">
                <label>Certificate Type:</label>
                <span>{sslStatus.is_self_signed ? 'Self-Signed' : 'CA-Signed'}</span>
              </div>
              <div className="status-item">
                <label>Certificate Exists:</label>
                <span className={sslStatus.cert_exists ? 'status-success' : 'status-error'}>
                  {sslStatus.cert_exists ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="status-item">
                <label>Private Key Exists:</label>
                <span className={sslStatus.key_exists ? 'status-success' : 'status-error'}>
                  {sslStatus.key_exists ? 'Yes' : 'No'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Certificate Information */}
      {sslStatus?.configured && sslStatus?.cert_info && (
        <div className="config-section">
          <h2>Certificate Information</h2>
          <div className="cert-info-grid">
            <div className="cert-info-item">
              <label>Common Name:</label>
              <span>{sslStatus.cert_info.common_name || 'N/A'}</span>
            </div>
            <div className="cert-info-item">
              <label>Organization:</label>
              <span>{sslStatus.cert_info.organization || 'N/A'}</span>
            </div>
            <div className="cert-info-item">
              <label>Valid From:</label>
              <span>{formatDate(sslStatus.cert_info.not_before)}</span>
            </div>
            <div className="cert-info-item">
              <label>Valid Until:</label>
              <span className={isExpired() ? 'status-error' : isExpiringSoon() ? 'status-warning' : ''}>
                {formatDate(sslStatus.cert_info.not_after)}
                {isExpired() && ' (EXPIRED)'}
                {!isExpired() && isExpiringSoon() && ' (Expires Soon)'}
              </span>
            </div>
            <div className="cert-info-item">
              <label>Serial Number:</label>
              <span className="serial-number">{sslStatus.cert_info.serial_number || 'N/A'}</span>
            </div>
            <div className="cert-info-item">
              <label>Issuer:</label>
              <span className="issuer">{sslStatus.cert_info.issuer || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Upload Certificate */}
      <div className="config-section">
        <h2>Upload CA-Signed Certificate</h2>
        <p className="section-description">
          Upload a certificate signed by a Certificate Authority for production use
        </p>
        <form onSubmit={handleUpload} className="upload-form">
          <div className="form-group">
            <label htmlFor="certFileInput">Certificate File (PEM format):</label>
            <input
              type="file"
              id="certFileInput"
              accept=".pem,.crt,.cer"
              onChange={(e) => setCertFile(e.target.files[0])}
              disabled={uploading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="keyFileInput">Private Key File (PEM format):</label>
            <input
              type="file"
              id="keyFileInput"
              accept=".pem,.key"
              onChange={(e) => setKeyFile(e.target.files[0])}
              disabled={uploading}
            />
          </div>
          <button 
            type="submit" 
            className="btn-primary"
            disabled={uploading || !certFile || !keyFile}
          >
            {uploading ? 'Uploading...' : 'Upload Certificate'}
          </button>
        </form>
      </div>

      {/* Regenerate Self-Signed */}
      <div className="config-section">
        <h2>Generate Self-Signed Certificate</h2>
        <p className="section-description">
          Generate a new self-signed certificate for testing or development
        </p>
        <div className="form-group">
          <label htmlFor="hostname">Hostname / Common Name:</label>
          <input
            type="text"
            id="hostname"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            disabled={regenerating}
            placeholder="localhost"
          />
        </div>
        <div className="form-group">
          <label htmlFor="validityDays">Validity Period (days):</label>
          <input
            type="number"
            id="validityDays"
            value={validityDays}
            onChange={(e) => setValidityDays(parseInt(e.target.value))}
            disabled={regenerating}
            min="1"
            max="3650"
          />
        </div>
        <button 
          onClick={handleRegenerate}
          className="btn-secondary"
          disabled={regenerating}
        >
          {regenerating ? 'Generating...' : 'Generate Self-Signed Certificate'}
        </button>
      </div>

      {/* Instructions */}
      <div className="config-section info-section">
        <h2>Instructions</h2>
        <div className="instructions">
          <h3>For Production Use:</h3>
          <ol>
            <li>Obtain a certificate from a trusted Certificate Authority (CA)</li>
            <li>Upload both the certificate and private key files using the form above</li>
            <li>Restart the application to apply the new certificate</li>
          </ol>

          <h3>For Development/Testing:</h3>
          <ol>
            <li>Generate a self-signed certificate using the form above</li>
            <li>Restart the application</li>
            <li>Accept the security warning in your browser (self-signed certificates are not trusted by default)</li>
          </ol>

          <h3>File Formats:</h3>
          <ul>
            <li>Both certificate and private key must be in PEM format</li>
            <li>Common file extensions: .pem, .crt, .cer (certificate), .key (private key)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default SSLConfigPage;
