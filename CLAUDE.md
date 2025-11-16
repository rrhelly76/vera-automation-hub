# CLAUDE.md - CloudVersionTracker AI Assistant Guide

## Project Overview

**CloudVersionTracker** is a full-stack web application designed to track and monitor version information across VMware cloud infrastructure technologies. It collects, stores, and displays version data for vSphere (vCenter, ESXi hosts, Clusters), NSX-T, vCloud Director, and Usage Meter.

### Key Features
- Automated daily data collection from VMware infrastructure
- Manual on-demand data pulls
- Version history tracking
- Multi-technology support (vSphere, NSX-T, vCD, Usage Meter)
- Role-based access control (Admin, Support, ReadOnly)
- LDAP integration for enterprise authentication
- SSL/HTTPS support with certificate management
- User timezone preferences for all timestamps
- Dark mode support

### Tech Stack
- **Backend**: Python Flask, SQLite, APScheduler
- **Frontend**: React.js, React Router, Axios
- **VMware APIs**: pyVmomi (vSphere), NSX-T REST API, vCD REST API
- **Authentication**: Flask sessions, LDAP (optional)
- **Scheduling**: APScheduler for daily automated pulls

---

## Architecture

### System Architecture
```
┌─────────────────┐         ┌──────────────────┐
│   React SPA     │ ◄─────► │   Flask Backend  │
│  (Port 3000)    │  HTTP   │   (Port 5000)    │
└─────────────────┘         └──────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
            ┌──────────────┐  ┌──────────┐  ┌──────────────┐
            │   SQLite DB  │  │   LDAP   │  │   VMware     │
            │              │  │  Server  │  │   APIs       │
            └──────────────┘  └──────────┘  └──────────────┘
```

### Request Flow
1. User interacts with React frontend
2. Frontend makes API calls to Flask backend (axios with credentials)
3. Backend validates session and permissions
4. Backend queries database or VMware APIs
5. Response returned to frontend in JSON format
6. Frontend displays data with timezone-aware formatting

---

## Directory Structure

```
CloudVersionTracker/
├── backend/
│   ├── app.py                          # Main Flask application
│   ├── ldap_auth.py                    # LDAP authentication module
│   ├── ssl_manager.py                  # SSL certificate management
│   └── collectors/                     # Data collectors for each technology
│       ├── vsphere_collector.py        # vCenter, ESXi, Cluster collector
│       ├── nsx_collector.py            # NSX-T Manager collector
│       ├── vcd_collector.py            # vCloud Director collector
│       └── usage_meter_collector.py    # Usage Meter collector
│
└── frontend/
    ├── package.json                    # NPM dependencies
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js                      # Main app component with routing
        ├── App.css                     # Global styles
        ├── index.js                    # React entry point
        ├── AuthContext.js              # Authentication context provider
        ├── components/
        │   ├── DevelopmentWarningModal.js
        │   └── VersionHistory.js
        ├── utils/
        │   └── dateUtils.js            # Timezone-aware date formatting
        └── pages/                      # All page components
            ├── LoginPage.js
            ├── DashboardPage.js
            ├── VSphereLandingPage.js   # vSphere hub page
            ├── VCenterPage.js          # vCenter servers
            ├── VSpherePage.js          # ESXi hosts
            ├── VSphereClustersPage.js  # Cluster information
            ├── NSXPage.js
            ├── NSXConfigPage.js
            ├── VCDPage.js
            ├── VCDConfigPage.js
            ├── UsageMeterPage.js
            ├── UsageMeterConfigPage.js
            ├── SettingsPage.js         # Settings hub (Admin only)
            ├── UserManagementPage.js   # User CRUD (Admin only)
            ├── UserPreferencesPage.js  # Timezone settings (All users)
            ├── SSLConfigPage.js        # SSL management (Admin only)
            └── LDAPConfigPage.js       # LDAP config (Admin only)
```

---

## Key Components

### Backend (app.py)

**Location**: `backend/app.py` (2121 lines)

The Flask application is the core of the backend, handling:
- API endpoints for all operations
- Session-based authentication
- Role-based access control via decorators
- Database initialization and migrations
- Scheduled data collection
- CORS configuration for frontend communication

**Key Functions**:
- `init_db()` - Initialize SQLite database with all required tables
- `login_required` - Decorator for protected endpoints
- `require_permission(permission)` - Decorator for role-based access
- `collect_vsphere_data()` - Trigger vSphere data collection
- `collect_nsx_data()` - Trigger NSX-T data collection
- `collect_vcd_data()` - Trigger vCD data collection
- `collect_usage_meter_data()` - Trigger Usage Meter data collection
- `start_scheduler()` - Initialize APScheduler for daily automated pulls

### Data Collectors

Each collector follows a similar pattern:

**VSphere Collector** (`backend/collectors/vsphere_collector.py`):
- Uses pyVmomi to connect to vCenter
- Collects vCenter version info
- Iterates through all clusters and ESXi hosts
- Gathers hardware info, DRS/HA settings, lifecycle management details
- Returns structured data for database storage

**Pattern**:
```python
class CollectorName:
    def __init__(self, db_path='version_data.db'):
        self.load_config()  # Load from database

    def collect_all(self):
        # Connect to all configured instances
        # Collect version data
        # Return list of results

    def test_connection(self, hostname, username, password):
        # Test connectivity for config validation
```

### Frontend Architecture

**App.js** (`frontend/src/App.js`):
- Main application component
- Handles routing with React Router
- Manages authentication state via AuthContext
- Loads and displays sync status bar
- Manages user preferences (timezone, dark mode)
- Reloads preferences on navigation to pick up changes

**AuthContext.js** (`frontend/src/AuthContext.js`):
- Provides global authentication state
- Session check on app load
- Login/logout functionality
- Permission checking helper

**Date Utilities** (`frontend/src/utils/dateUtils.js`):
- `formatDateTime(dateString, timezone)` - Format timestamps with user timezone
- `formatDate(dateString, timezone)` - Date only
- `formatTime(dateString, timezone)` - Time only
- `formatRelativeTime(dateString)` - Relative time ("2 hours ago")

---

## Database Schema

**Database**: SQLite (`version_data.db`)

### Core Tables

**versions** - Current version data for all components
```sql
CREATE TABLE versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    technology TEXT NOT NULL,           -- 'vsphere', 'nsx-t', 'vcd', 'usage-meter'
    component_name TEXT NOT NULL,       -- Name of component (e.g., vCenter hostname)
    version TEXT NOT NULL,              -- Version string
    last_updated TIMESTAMP NOT NULL,
    metadata TEXT,                      -- JSON metadata (varies by technology)
    UNIQUE(technology, component_name)
)
```

**version_history** - Historical version changes
```sql
CREATE TABLE version_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    technology TEXT NOT NULL,
    component_name TEXT NOT NULL,
    version TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    metadata TEXT
)
```

**last_sync** - Sync status for each technology
```sql
CREATE TABLE last_sync (
    technology TEXT PRIMARY KEY,
    last_sync_time TIMESTAMP NOT NULL,
    status TEXT NOT NULL,               -- 'success' or 'error'
    message TEXT
)
```

**users** - User accounts and preferences
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,                 -- 'Admin', 'Support', 'ReadOnly'
    created_at TIMESTAMP NOT NULL,
    last_login TIMESTAMP,
    timezone TEXT DEFAULT 'UTC',
    dark_mode INTEGER DEFAULT 0
)
```

### Configuration Tables

- **vcenter_configs** - vCenter connection details
- **nsx_configs** - NSX-T Manager connection details
- **vcd_configs** - vCloud Director connection details
- **usage_meter_configs** - Usage Meter connection details
- **ssl_config** - SSL certificate information
- **ldap_config** - LDAP server configuration
- **ldap_group_mappings** - LDAP group to role mappings

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login (local or LDAP)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Check current session

### User Management (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `PUT /api/users/<id>` - Update user
- `DELETE /api/users/<id>` - Delete user

### User Preferences (All users)
- `GET /api/user/preferences` - Get current user preferences
- `PUT /api/user/preferences` - Update preferences (timezone, dark_mode)
- `GET /api/timezones` - Get list of available timezones

### Version Data (Authenticated)
- `GET /api/technologies` - List tracked technologies
- `GET /api/versions/<technology>` - Get current versions for technology
- `GET /api/version-history/<technology>` - Get version history
- `GET /api/sync-status` - Get last sync status for all technologies
- `GET /api/vsphere/clusters` - Get cluster information with aggregated data

### Data Collection (Support/Admin)
- `POST /api/pull/<technology>` - Manually trigger data collection

### Configuration (Admin only)
- `GET /api/vcenter-configs` - List vCenter configs
- `POST /api/vcenter-configs` - Add vCenter
- `PUT /api/vcenter-configs/<id>` - Update vCenter
- `DELETE /api/vcenter-configs/<id>` - Delete vCenter
- `POST /api/vcenter-configs/<id>/test` - Test vCenter connection

*Similar endpoints exist for NSX, vCD, and Usage Meter configurations*

### SSL Management (Admin only)
- `GET /api/ssl/status` - Get SSL certificate status
- `POST /api/ssl/upload` - Upload new certificate
- `POST /api/ssl/regenerate` - Regenerate self-signed certificate

### LDAP Configuration (Admin only)
- `GET /api/ldap/config` - Get LDAP configuration
- `POST /api/ldap/config` - Save LDAP configuration
- `POST /api/ldap/test` - Test LDAP connection
- `POST /api/ldap/groups/search` - Search for LDAP groups
- `GET /api/ldap/mappings` - Get group mappings
- `POST /api/ldap/mappings` - Add group mapping
- `DELETE /api/ldap/mappings/<id>` - Delete group mapping

---

## Authentication & Authorization

### Role System

Three roles with hierarchical permissions:

```python
ROLES = {
    'Admin': {'config': True, 'pull': True, 'view': True},
    'Support': {'config': False, 'pull': True, 'view': True},
    'ReadOnly': {'config': False, 'pull': False, 'view': True}
}
```

- **config**: Manage configurations (vCenter, NSX, etc.), users, SSL, LDAP
- **pull**: Trigger manual data collection
- **view**: View data (all authenticated users)

### Session Management

- Flask sessions with secure cookies
- Session stored server-side
- `withCredentials: true` in axios for cookie transmission
- CORS configured for allowed origins

### LDAP Integration

When enabled, LDAP authentication takes precedence over local auth:
1. User enters credentials
2. System attempts LDAP authentication
3. LDAP groups mapped to local roles via `ldap_group_mappings` table
4. User created/updated in local database for session management
5. Falls back to local auth if LDAP fails (user not found)

---

## Data Collection System

### Automated Scheduling

APScheduler runs daily collections at 2:00 AM:
- 2:00 AM - vSphere collection
- 2:15 AM - NSX-T collection
- 2:30 AM - vCD collection
- 2:45 AM - Usage Meter collection

### Collection Process

1. Collector loads enabled configurations from database
2. Connects to each configured instance
3. Retrieves version and metadata
4. Updates `versions` table (INSERT OR REPLACE)
5. Adds entry to `version_history` table
6. Updates `last_sync` table with status
7. Returns success/error status

### Metadata Storage

Each technology stores different metadata in JSON format:

**vSphere (vCenter)**:
```json
{
    "type": "vcenter",
    "build": "12345",
    "full_name": "VMware vCenter Server 8.0.2",
    "api_version": "8.0.2.0"
}
```

**vSphere (Cluster)**:
```json
{
    "type": "cluster",
    "vcenter": "vcenter01.example.com",
    "environment": "Production",
    "host_count": 8,
    "vm_count": 150,
    "drs_enabled": true,
    "ha_enabled": true,
    "evc_mode": "intel-skylake"
}
```

**vSphere (ESXi Host)**:
```json
{
    "type": "host",
    "vcenter": "vcenter01.example.com",
    "cluster": "Cluster-01",
    "hardware_vendor": "Dell Inc.",
    "hardware_model": "PowerEdge R640",
    "connection_state": "connected",
    "power_state": "poweredOn"
}
```

---

## Frontend Architecture

### Routing Structure

```
/ (Dashboard)
├── /vsphere-landing (vSphere hub)
│   ├── /vcenters (vCenter servers)
│   ├── /vsphere (ESXi hosts)
│   └── /vsphere-clusters (Clusters)
├── /nsx-t (NSX-T managers)
├── /vcd (vCloud Director instances)
├── /usage-meter (Usage Meter instances)
├── /user-preferences (All users)
└── /settings (Admin only - Settings hub)
    ├── /user-management
    ├── /ssl-config
    ├── /ldap-config
    ├── /vcenter-config
    ├── /nsx-t-config
    ├── /vcd-config
    └── /usage-meter-config
```

### State Management

- **Global State**: AuthContext (user, authentication status)
- **Local State**: Component-level state with React hooks
- **Preferences**: Loaded in App.js, passed as props
- **API Calls**: Direct axios calls in components (no Redux/state library)

### Component Patterns

**Page Components**:
```javascript
function PageComponent({ onRefresh, userTimezone }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // Fetch from API
        // Update state
    };

    return (
        // Render with formatDateTime(timestamp, userTimezone)
    );
}
```

### Timezone Handling

All timestamps MUST be formatted using `dateUtils.js`:
```javascript
import { formatDateTime } from '../utils/dateUtils';

// In component
<span>{formatDateTime(item.last_updated, userTimezone)}</span>
```

---

## Development Workflows

### Setting Up Development Environment

**Backend**:
```bash
cd backend
pip install flask flask-cors pyVmomi apscheduler pytz werkzeug requests urllib3 python-ldap
python app.py
```

**Frontend**:
```bash
cd frontend
npm install
npm start
```

**Default Credentials**: admin / admin

### Adding a New Technology

1. **Create Collector** (`backend/collectors/new_tech_collector.py`):
   - Inherit collection pattern from existing collectors
   - Implement `load_config()`, `collect_all()`, `test_connection()`

2. **Add Config Table** (in `app.py` `init_db()`):
   ```python
   c.execute('''CREATE TABLE IF NOT EXISTS new_tech_configs
                (id INTEGER PRIMARY KEY AUTOINCREMENT,
                 name TEXT NOT NULL UNIQUE,
                 hostname TEXT NOT NULL,
                 ...)''')
   ```

3. **Add Collection Function** (in `app.py`):
   ```python
   def collect_new_tech_data():
       collector = NewTechCollector()
       results = collector.collect_all()
       for result in results:
           update_version_data('new-tech', result['name'], result['version'], result.get('metadata'))
       update_sync_status('new-tech', 'success', f'Collected {len(results)} components')
   ```

4. **Add to Scheduler** (in `start_scheduler()`):
   ```python
   scheduler.add_job(
       func=collect_new_tech_data,
       trigger="cron",
       hour=3,
       minute=0,
       id='new_tech_daily_collection'
   )
   ```

5. **Add API Endpoints**: Config CRUD, test connection, manual pull

6. **Create Frontend Pages**: Data display page, config page

7. **Update Navigation**: Add to navbar in `App.js`

### Adding a New API Endpoint

1. Define route in `app.py`
2. Add authentication decorators as needed
3. Document in this file under API Endpoints section
4. Create corresponding frontend API call

### Database Migrations

When adding columns to existing tables:
```python
# In init_db()
try:
    c.execute("SELECT new_column FROM table_name LIMIT 1")
except sqlite3.OperationalError:
    print("Adding new_column to table_name...")
    c.execute("ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value")
    c.execute("UPDATE table_name SET new_column = 'default' WHERE new_column IS NULL")
```

---

## Code Conventions

### Python (Backend)

- **Style**: PEP 8
- **Naming**:
  - Functions: `snake_case`
  - Classes: `PascalCase`
  - Constants: `UPPER_CASE`
- **Error Handling**: Always use try/except for external API calls
- **Database Access**: Always close connections in finally blocks
- **Security**: Never log passwords; use werkzeug for password hashing

### JavaScript (Frontend)

- **Style**: Modern JavaScript (ES6+)
- **Naming**:
  - Components: `PascalCase`
  - Functions/variables: `camelCase`
  - Constants: `UPPER_CASE`
- **Components**: Functional components with hooks (no class components)
- **API Calls**: Always use `withCredentials: true` in axios
- **Timezone**: Always use `formatDateTime()` from dateUtils for timestamps
- **State**: Use useState, useEffect, and useContext hooks

### File Organization

- Backend: One collector per file in `collectors/`
- Frontend: One component per file in appropriate directory
- Styles: Colocate CSS with component (e.g., `Page.js` → `Page.css`)
- Utilities: Shared utilities in `utils/` directory

---

## Common Tasks for AI Assistants

### Task 1: Fix a Bug in Data Collection

1. Identify the technology (vSphere, NSX, vCD, Usage Meter)
2. Locate collector file in `backend/collectors/`
3. Read the collector code and understand the API calls
4. Check error messages in console or `last_sync` table
5. Fix the issue (usually API changes, authentication, or data parsing)
6. Test with `POST /api/pull/<technology>` endpoint

### Task 2: Add a New Field to Display

**Backend**:
1. Modify collector to capture new data in metadata
2. Update `collect_all()` to include new field in result metadata

**Frontend**:
1. Update page component to display new field
2. Add to table/grid rendering
3. Format appropriately (especially dates with timezone)

### Task 3: Add a New User Preference

**Backend** (app.py):
1. Add column to users table in `init_db()` with migration
2. Update `get_user_preferences()` to include new field
3. Update `update_user_preferences()` to handle new field

**Frontend**:
1. Add UI control in `UserPreferencesPage.js`
2. Update state management
3. Save via `PUT /api/user/preferences`
4. Apply preference in relevant components

### Task 4: Create a New Configuration Page

1. Create config page component (e.g., `NewTechConfigPage.js`)
2. Implement CRUD operations (Create, Read, Update, Delete)
3. Add "Test Connection" button with API call
4. Add route to `App.js` with `hasPermission('config')` guard
5. Link from Settings page

### Task 5: Debug Authentication Issues

**Common Issues**:
- CORS: Check `allowed_origins` in app.py
- Session cookies: Verify `withCredentials: true` in axios
- LDAP: Check `ldap_config` table and test with `/api/ldap/test`
- Permissions: Verify role in `users` table and `ROLES` definition

**Debugging Steps**:
1. Check browser console for CORS errors
2. Verify session cookie in browser DevTools
3. Test `/api/auth/session` endpoint
4. Check Flask console for authentication logs

### Task 6: Update Dependencies

**Backend**:
- Review `requirements.txt` (if exists) or imports in app.py
- Test collector APIs for compatibility

**Frontend**:
- Update `package.json` dependencies
- Run `npm install`
- Test build with `npm run build`

---

## Security Considerations

### Credentials Storage
- vCenter/NSX/vCD passwords stored in SQLite (plaintext)
- User passwords hashed with werkzeug (PBKDF2-SHA256)
- Consider encrypting infrastructure credentials in production

### SSL/TLS
- Self-signed certificates for development
- Upload CA-signed certificates for production
- Backend disables SSL verification for VMware API calls (required for self-signed vCenter certs)

### Session Security
- Secret key configured via environment variable
- Session cookies: HTTP-only in production, secure flag when SSL enabled
- CORS restricted to specific origins

### Input Validation
- Required field validation on all API endpoints
- SQL injection prevented by parameterized queries
- Role-based access control on sensitive endpoints

---

## Testing

### Manual Testing

**Backend**:
- Test collection: `POST /api/pull/<technology>`
- Check sync status: `GET /api/sync-status`
- Verify database: `sqlite3 version_data.db`

**Frontend**:
- Test all pages with each role (Admin, Support, ReadOnly)
- Verify timezone changes take effect immediately
- Test configuration CRUD operations
- Validate dark mode toggle

### Connection Testing

Each technology config page includes "Test Connection" button:
- Verifies credentials
- Returns version information
- Validates API accessibility

---

## Deployment

### Production Considerations

1. **Environment Variables**:
   ```bash
   export SECRET_KEY='strong-random-secret-key'
   export SSL_ENABLED='true'
   export SSL_CERT_PATH='/path/to/cert.pem'
   export SSL_KEY_PATH='/path/to/key.pem'
   ```

2. **Database**:
   - Consider PostgreSQL for production
   - Regular backups of version_data.db
   - Encrypt credentials at rest

3. **SSL Certificates**:
   - Upload CA-signed certificate via SSL Config page
   - Set appropriate file permissions (cert: 644, key: 600)

4. **Reverse Proxy**:
   - Use nginx/Apache for production
   - Proxy frontend (port 3000) and backend (port 5000)
   - Enable HTTPS

5. **Systemd Service** (Example):
   ```ini
   [Unit]
   Description=CloudVersionTracker Backend

   [Service]
   WorkingDirectory=/opt/cloudversiontracker/backend
   ExecStart=/usr/bin/python3 app.py
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

---

## Troubleshooting

### Common Issues

**"Authentication required" on API calls**:
- Check axios credentials config
- Verify session cookie
- Check CORS origin allowlist

**Data collection fails**:
- Test connection from config page
- Check credentials in database
- Verify network connectivity to vCenter/NSX/etc.
- Review collector logs in console

**Timezone not updating**:
- Refresh page after changing preference
- Verify `userTimezone` prop passed to components
- Check `formatDateTime()` usage

**LDAP authentication not working**:
- Test LDAP connection: `POST /api/ldap/test`
- Verify LDAP config in database
- Check group mappings
- Review bind DN and search filters

---

## Additional Resources

### VMware API Documentation
- vSphere API (pyVmomi): https://github.com/vmware/pyvmomi
- NSX-T API: NSX-T API Guide (vendor docs)
- vCD API: vCloud Director API Programming Guide

### Framework Documentation
- Flask: https://flask.palletsprojects.com/
- React: https://react.dev/
- React Router: https://reactrouter.com/

### Database
- SQLite: https://www.sqlite.org/docs.html
- APScheduler: https://apscheduler.readthedocs.io/

---

## Quick Reference

### File Locations
| Purpose | Location |
|---------|----------|
| Main backend app | `backend/app.py` |
| Database | `backend/version_data.db` (auto-created) |
| vSphere collector | `backend/collectors/vsphere_collector.py` |
| Main frontend app | `frontend/src/App.js` |
| Date utilities | `frontend/src/utils/dateUtils.js` |
| Auth context | `frontend/src/AuthContext.js` |

### Common Commands
```bash
# Start backend
cd backend && python app.py

# Start frontend
cd frontend && npm start

# Build frontend for production
cd frontend && npm run build

# Query database
sqlite3 backend/version_data.db "SELECT * FROM versions;"

# Test API endpoint
curl -X GET http://localhost:5000/api/auth/session -b cookies.txt

# Manual data pull
curl -X POST http://localhost:5000/api/pull/vsphere -b cookies.txt
```

### Default Configuration
- Backend URL: http://localhost:5000
- Frontend URL: http://localhost:3000
- Default user: admin / admin
- Scheduled pulls: Daily at 2:00 AM
- Database: SQLite (version_data.db)

---

## Conclusion

This guide should provide AI assistants with comprehensive understanding of the CloudVersionTracker codebase. The application follows standard web development patterns with clear separation between backend (Flask/Python) and frontend (React).

When making changes:
1. Always test locally first
2. Follow existing code patterns
3. Update this document if architecture changes
4. Consider backward compatibility for database changes
5. Use timezone-aware date formatting for all timestamps

For questions or issues, refer to the inline code comments and existing implementations as examples.
