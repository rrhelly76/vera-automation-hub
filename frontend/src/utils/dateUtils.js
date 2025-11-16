// Utility functions for date/time formatting with timezone support

/**
 * Format a date/time string with user's timezone
 * @param {string} dateString - ISO date string or date object
 * @param {string} timezone - IANA timezone string (e.g., 'America/New_York')
 * @param {object} options - Additional Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDateTime = (dateString, timezone = 'UTC', options = {}) => {
  if (!dateString) return 'Never';
  
  try {
    const defaultOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...options
    };
    
    return new Date(dateString).toLocaleString('en-US', defaultOptions);
  } catch (error) {
    console.error('Error formatting date:', error);
    // Fallback to default locale formatting
    return new Date(dateString).toLocaleString();
  }
};

/**
 * Format a date only (no time)
 * @param {string} dateString - ISO date string or date object  
 * @param {string} timezone - IANA timezone string
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString, timezone = 'UTC') => {
  if (!dateString) return 'Never';
  
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return new Date(dateString).toLocaleDateString();
  }
};

/**
 * Format a time only (no date)
 * @param {string} dateString - ISO date string or date object
 * @param {string} timezone - IANA timezone string  
 * @returns {string} Formatted time string
 */
export const formatTime = (dateString, timezone = 'UTC') => {
  if (!dateString) return 'Never';
  
  try {
    return new Date(dateString).toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting time:', error);
    return new Date(dateString).toLocaleTimeString();
  }
};

/**
 * Get relative time (e.g., "2 hours ago")
 * Note: This doesn't use timezone since it's relative
 * @param {string} dateString - ISO date string or date object
 * @returns {string} Relative time string
 */
export const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Never';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) return `${diffSec} seconds ago`;
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    
    // For longer periods, return formatted date
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return 'Unknown';
  }
};
