## Directory Structure
```
project/
├── backend/
│   ├── app.py
│   ├── ldap_auth.py
│   ├── ssl_manager.py
│   └── collectors/
│       ├── vsphere_collector.py
│       ├── nsx_collector.py
│       ├── vcd_collector.py
│       └── usage_meter_collector.py
│
└── frontend/
    └── src/
        ├── App.js
        ├── App.css
        ├── index.js
        ├── index.css
        ├── AuthContext.js
        ├── components/
        │   ├── DevelopmentWarningModal.js  # Warning modal for dev environment
        │   ├── DevelopmentWarningModal.css
        │   └── VersionHistory.js
        ├── utils/
        │   └── dateUtils.js               # NEW: Timezone-aware date formatting utilities
        └── pages/
            ├── LoginPage.js
            ├── LoginPage.css
            ├── DashboardPage.js
            │
            ├── VSphereLandingPage.js      # NEW: vSphere landing page
            ├── VSphereLandingPage.css     # NEW: vSphere landing styles
            ├── VCenterPage.js
            ├── VCenterConfigPage.js
            ├── VSpherePage.js             # ESXi Hosts page
            ├── VSphereClustersPage.js
            │
            ├── NSXPage.js
            ├── NSXConfigPage.js
            │
            ├── VCDPage.js
            ├── VCDConfigPage.js
            │
            ├── UsageMeterPage.js
            ├── UsageMeterConfigPage.js
            │
            ├── SettingsPage.js            # NEW: Settings landing page
            ├── SettingsPage.css           # NEW: Settings landing styles
            ├── UserManagementPage.js
            ├── UserManagementPage.css
            ├── UserPreferencesPage.js     # NEW: User timezone preferences
            ├── UserPreferencesPage.css    # NEW: User preferences styles
            ├── SSLConfigPage.js
            ├── SSLConfigPage.css
            ├── LDAPConfigPage.js
            └── LDAPConfigPage.css
```

## Navigation Structure

### Main Navigation
- Dashboard → All technologies overview
- vSphere → Landing page for vSphere infrastructure
  - vCenter Servers
  - ESXi Hosts
  - Clusters
- NSX-T → NSX-T networking page
- vCloud Director → vCD instances page
- Usage Meter → Usage Meter monitoring page
- Settings (Admin only) → Settings landing page
  - User Preferences (All users) → Timezone and personal settings
  - User Management
  - SSL Configuration
  - LDAP Configuration

### Technology Configuration Pages (Admin only)
Each technology has a dedicated configuration page accessible from its main page:
- vCenter Configuration
- NSX-T Configuration
- vCloud Director Configuration
- Usage Meter Configuration

## Features

### User Preferences & Timezone Support
- All users can access User Preferences to set their local timezone
- Timezone setting is stored per-user in the database
- All timestamps throughout the application display in the user's selected timezone:
  - Sync status bar timestamps
  - Created/Last Login dates in User Management
  - All data collection timestamps
- Date formatting utilities in `utils/dateUtils.js` provide consistent timezone-aware formatting
- Timezone preferences reload automatically when navigating between pages

### Authentication & Access Control
- Local authentication with password hashing
- LDAP integration with group-based role mapping
- Three role levels: Admin, Support, Read-Only
- SSL/HTTPS support with certificate management
- Session-based authentication with secure cookies
