import React, { useState, useEffect } from 'react';
import './DevelopmentWarningModal.css';

function DevelopmentWarningModal() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the warning has been shown this session
    const hasSeenWarning = sessionStorage.getItem('dev_warning_shown');
    
    if (!hasSeenWarning) {
      setIsVisible(true);
    }
  }, []);

  const handleClose = () => {
    sessionStorage.setItem('dev_warning_shown', 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="warning-modal-overlay">
      <div className="warning-modal">
        <div className="warning-header">
          <div className="warning-icon">⚠️</div>
          <h2>Development Notice</h2>
        </div>
        
        <div className="warning-body">
          <p>
            This application is currently <strong>under development</strong> and should 
            <strong> not be used as a source of truth</strong> for production decisions.
          </p>
          <p>
            Data displayed may be incomplete, inaccurate, or subject to change. 
            Please verify all information through official channels before taking action.
          </p>
        </div>
        
        <div className="warning-footer">
          <button className="warning-button" onClick={handleClose}>
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}

export default DevelopmentWarningModal;
