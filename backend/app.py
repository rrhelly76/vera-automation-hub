from flask import Flask, jsonify, request, session, make_response
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import sqlite3
import json
import os
import ssl
import pytz

# Try to import collectors and LDAP - they may not be available if dependencies aren't installed
try:
    from collectors.vsphere_collector import VSphereCollector
except ImportError:
    print("Warning: VSphere collector not available (pyVmomi not installed)")
    VSphereCollector = None

try:
    from collectors.nsx_collector import NSXCollector
except ImportError:
    print("Warning: NSX collector not available")
    NSXCollector = None

try:
    from collectors.vcd_collector import VCDCollector
except ImportError:
    print("Warning: VCD collector not available")
    VCDCollector = None

try:
    from collectors.usage_meter_collector import UsageMeterCollector
except ImportError:
    print("Warning: Usage Meter collector not available")
    UsageMeterCollector = None

try:
    from ldap_auth import LDAPAuthenticator
except ImportError:
    print("Warning: LDAP authentication not available (python-ldap not installed)")
    LDAPAuthenticator = None

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Initialize LDAP authenticator
ldap_auth = None

# Session cookie configuration - permissive for development with cross-protocol
app.config.update(
    SESSION_COOKIE_SECURE=False,  # Allow HTTP
    SESSION_COOKIE_HTTPONLY=False,  # Allow JS access for debugging
    SESSION_COOKIE_SAMESITE='Lax',  # Lax for same-site
    SESSION_COOKIE_PATH='/',
)

# Handle CORS manually for better cookie control
@app.after_request  
def after_request(response):
    origin = request.headers.get('Origin')
    # Allow requests from frontend
    allowed_origins = [
        'http://localhost:3000', 'https://localhost:3000',
        'http://127.0.0.1:3000', 'https://127.0.0.1:3000',
        'http://172.17.8.159:3000', 'https://172.17.8.159:3000'
    ]
    
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Requested-With'
        response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS,PATCH'
        response.headers['Access-Control-Max-Age'] = '3600'
    
    return response

# Handle OPTIONS requests for CORS preflight
@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        response = make_response()
        origin = request.headers.get('Origin')
        allowed_origins = [
            'http://localhost:3000', 'https://localhost:3000',
            'http://127.0.0.1:3000', 'https://127.0.0.1:3000',
            'http://172.17.8.159:3000', 'https://172.17.8.159:3000'
        ]
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Requested-With'
            response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS,PATCH'
            response.headers['Access-Control-Max-Age'] = '3600'
        return response

# SSL Configuration
SSL_ENABLED = os.environ.get('SSL_ENABLED', 'true').lower() == 'true'
SSL_CERT_PATH = os.environ.get('SSL_CERT_PATH', 'ssl/cert.pem')
SSL_KEY_PATH = os.environ.get('SSL_KEY_PATH', 'ssl/key.pem')

# Database setup
DB_PATH = 'version_data.db'

# Role definitions
ROLES = {
    'Admin': {'config': True, 'pull': True, 'view': True},
    'Support': {'config': False, 'pull': True, 'view': True},
    'ReadOnly': {'config': False, 'pull': False, 'view': True}
}

def init_db():
    """Initialize the database with required tables"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Main versions table
    c.execute('''CREATE TABLE IF NOT EXISTS versions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  technology TEXT NOT NULL,
                  component_name TEXT NOT NULL,
                  version TEXT NOT NULL,
                  last_updated TIMESTAMP NOT NULL,
                  metadata TEXT,
                  UNIQUE(technology, component_name))''')
    
    # History table for tracking changes
    c.execute('''CREATE TABLE IF NOT EXISTS version_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  technology TEXT NOT NULL,
                  component_name TEXT NOT NULL,
                  version TEXT NOT NULL,
                  timestamp TIMESTAMP NOT NULL,
                  metadata TEXT)''')
    
    # Last sync table
    c.execute('''CREATE TABLE IF NOT EXISTS last_sync
                 (technology TEXT PRIMARY KEY,
                  last_sync_time TIMESTAMP NOT NULL,
                  status TEXT NOT NULL,
                  message TEXT)''')
    
    # vCenter configurations table
    c.execute('''CREATE TABLE IF NOT EXISTS vcenter_configs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  vcenter_name TEXT NOT NULL UNIQUE,
                  hostname TEXT NOT NULL,
                  username TEXT NOT NULL,
                  password TEXT NOT NULL,
                  enabled INTEGER DEFAULT 1,
                  created_at TIMESTAMP NOT NULL,
                  updated_at TIMESTAMP NOT NULL)''')
    
    # NSX Manager configurations table
    c.execute('''CREATE TABLE IF NOT EXISTS nsx_configs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  manager_name TEXT NOT NULL UNIQUE,
                  hostname TEXT NOT NULL,
                  username TEXT NOT NULL,
                  password TEXT NOT NULL,
                  environment TEXT DEFAULT 'Production',
                  enabled INTEGER DEFAULT 1,
                  created_at TIMESTAMP NOT NULL,
                  updated_at TIMESTAMP NOT NULL)''')
    
    # vCD configurations table
    c.execute('''CREATE TABLE IF NOT EXISTS vcd_configs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  vcd_name TEXT NOT NULL UNIQUE,
                  hostname TEXT NOT NULL,
                  username TEXT NOT NULL,
                  password TEXT NOT NULL,
                  org TEXT DEFAULT 'System',
                  environment TEXT DEFAULT 'Production',
                  enabled INTEGER DEFAULT 1,
                  created_at TIMESTAMP NOT NULL,
                  updated_at TIMESTAMP NOT NULL)''')
    
    # Usage Meter configurations table
    c.execute('''CREATE TABLE IF NOT EXISTS usage_meter_configs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  meter_name TEXT NOT NULL UNIQUE,
                  hostname TEXT NOT NULL,
                  username TEXT NOT NULL,
                  password TEXT NOT NULL,
                  environment TEXT DEFAULT 'Production',
                  enabled INTEGER DEFAULT 1,
                  created_at TIMESTAMP NOT NULL,
                  updated_at TIMESTAMP NOT NULL)''')
    
    # Users table for authentication
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT NOT NULL UNIQUE,
                  password_hash TEXT NOT NULL,
                  role TEXT NOT NULL,
                  created_at TIMESTAMP NOT NULL,
                  last_login TIMESTAMP,
                  timezone TEXT DEFAULT 'UTC')''')
    
    # Add timezone column if it doesn't exist (migration for existing databases)
    try:
        c.execute("SELECT timezone FROM users LIMIT 1")
    except sqlite3.OperationalError:
        print("Adding timezone column to users table...")
        c.execute("ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'UTC'")
        c.execute("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL")
    
    # Add dark_mode column if it doesn't exist (migration for existing databases)
    try:
        c.execute("SELECT dark_mode FROM users LIMIT 1")
    except sqlite3.OperationalError:
        print("Adding dark_mode column to users table...")
        c.execute("ALTER TABLE users ADD COLUMN dark_mode INTEGER DEFAULT 0")
        c.execute("UPDATE users SET dark_mode = 0 WHERE dark_mode IS NULL")
    
    # SSL configuration table
    c.execute('''CREATE TABLE IF NOT EXISTS ssl_config
                 (id INTEGER PRIMARY KEY CHECK (id = 1),
                  cert_path TEXT NOT NULL,
                  key_path TEXT NOT NULL,
                  cert_info TEXT,
                  is_self_signed INTEGER DEFAULT 1,
                  created_at TIMESTAMP NOT NULL,
                  expires_at TIMESTAMP,
                  uploaded_at TIMESTAMP)''')
    
    # LDAP configuration table
    c.execute('''CREATE TABLE IF NOT EXISTS ldap_config
                 (id INTEGER PRIMARY KEY CHECK (id = 1),
                  enabled INTEGER DEFAULT 0,
                  server TEXT NOT NULL,
                  port INTEGER DEFAULT 389,
                  use_ssl INTEGER DEFAULT 0,
                  base_dn TEXT NOT NULL,
                  bind_dn TEXT NOT NULL,
                  bind_password TEXT NOT NULL,
                  user_search_filter TEXT DEFAULT '(sAMAccountName={username})',
                  user_search_base TEXT,
                  group_search_base TEXT,
                  group_membership_attribute TEXT DEFAULT 'memberOf',
                  created_at TIMESTAMP NOT NULL,
                  updated_at TIMESTAMP NOT NULL)''')
    
    # LDAP group to role mappings table
    c.execute('''CREATE TABLE IF NOT EXISTS ldap_group_mappings
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ldap_group_dn TEXT NOT NULL UNIQUE,
                  site_role TEXT NOT NULL,
                  created_at TIMESTAMP NOT NULL)''')
    
    # Create default admin user if no users exist
    c.execute('SELECT COUNT(*) FROM users')
    if c.fetchone()[0] == 0:
        default_password = generate_password_hash('admin')
        timestamp = datetime.now().isoformat()
        c.execute('''INSERT INTO users (username, password_hash, role, created_at)
                     VALUES (?, ?, ?, ?)''',
                  ('admin', default_password, 'Admin', timestamp))
        print("Created default admin user (username: admin, password: admin)")
    
    conn.commit()
    conn.close()

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Role permission decorator
def require_permission(permission):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'error': 'Authentication required'}), 401
            
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute('SELECT role FROM users WHERE id = ?', (session['user_id'],))
            row = c.fetchone()
            conn.close()
            
            if not row:
                return jsonify({'error': 'User not found'}), 401
            
            role = row[0]
            if not ROLES.get(role, {}).get(permission, False):
                return jsonify({'error': f'Permission denied: {permission} access required'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Authentication endpoints
@app.route('/api/auth/login', methods=['POST'])
def login():
    global ldap_auth
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400
    
    # Initialize LDAP authenticator if not already done
    if ldap_auth is None and LDAPAuthenticator is not None:
        ldap_auth = LDAPAuthenticator()

    # Try LDAP authentication first if enabled
    if ldap_auth and ldap_auth.is_enabled():
        success, role, error = ldap_auth.authenticate(username, password)
        if success:
            # Create or update user in local database for session management
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            
            # Check if user exists
            c.execute('SELECT id FROM users WHERE username = ?', (username,))
            row = c.fetchone()
            
            timestamp = datetime.now().isoformat()
            
            if row:
                # Update existing user
                user_id = row[0]
                c.execute('''UPDATE users SET role = ?, last_login = ? WHERE id = ?''',
                         (role, timestamp, user_id))
            else:
                # Create new user (LDAP users don't need password_hash stored)
                c.execute('''INSERT INTO users (username, password_hash, role, created_at, last_login)
                            VALUES (?, ?, ?, ?, ?)''',
                         (username, '', role, timestamp, timestamp))
                user_id = c.lastrowid
            
            conn.commit()
            conn.close()
            
            # Set session
            session['user_id'] = user_id
            session['username'] = username
            session['role'] = role
            session['auth_method'] = 'ldap'
            
            return jsonify({
                'success': True,
                'user': {
                    'username': username,
                    'role': role,
                    'permissions': ROLES[role],
                    'auth_method': 'ldap'
                }
            })
        # If LDAP auth failed and it's not a "user not found" error, don't try local auth
        elif error and "not found" not in error.lower():
            return jsonify({'success': False, 'error': error}), 401
    
    # Fall back to local authentication
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, password_hash, role FROM users WHERE username = ?', (username,))
    row = c.fetchone()
    
    if row and row[1] and check_password_hash(row[1], password):  # row[1] check for non-empty password_hash
        user_id, _, role = row
        session['user_id'] = user_id
        session['username'] = username
        session['role'] = role
        
        # Update last login
        c.execute('UPDATE users SET last_login = ? WHERE id = ?', 
                  (datetime.now().isoformat(), user_id))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'user': {
                'username': username,
                'role': role,
                'permissions': ROLES[role]
            }
        })
    
    conn.close()
    return jsonify({'success': False, 'error': 'Invalid username or password'}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth/session', methods=['GET'])
def check_session():
    if 'user_id' not in session:
        return jsonify({'authenticated': False}), 200
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT username, role FROM users WHERE id = ?', (session['user_id'],))
    row = c.fetchone()
    conn.close()
    
    if not row:
        session.clear()
        return jsonify({'authenticated': False}), 200
    
    username, role = row
    return jsonify({
        'authenticated': True,
        'user': {
            'username': username,
            'role': role,
            'permissions': ROLES[role]
        }
    })

# User management endpoints (Admin only)
@app.route('/api/users', methods=['GET'])
@login_required
@require_permission('config')
def get_users():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, username, role, created_at, last_login FROM users ORDER BY username')
    rows = c.fetchall()
    conn.close()
    
    users = []
    for row in rows:
        users.append({
            'id': row[0],
            'username': row[1],
            'role': row[2],
            'created_at': row[3],
            'last_login': row[4]
        })
    
    return jsonify(users)

@app.route('/api/users', methods=['POST'])
@login_required
@require_permission('config')
def create_user():
    data = request.get_json()
    
    required_fields = ['username', 'password', 'role']
    for field in required_fields:
        if field not in data:
            return jsonify({'success': False, 'error': f'Missing field: {field}'}), 400
    
    if data['role'] not in ROLES:
        return jsonify({'success': False, 'error': 'Invalid role'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        password_hash = generate_password_hash(data['password'])
        timestamp = datetime.now().isoformat()
        
        c.execute('''INSERT INTO users (username, password_hash, role, created_at)
                     VALUES (?, ?, ?, ?)''',
                  (data['username'], password_hash, data['role'], timestamp))
        
        conn.commit()
        user_id = c.lastrowid
        conn.close()
        
        return jsonify({'success': True, 'id': user_id}), 201
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'Username already exists'}), 409

@app.route('/api/users/<int:user_id>', methods=['PUT', 'DELETE'])
@login_required
@require_permission('config')
def user_operations(user_id):
    if request.method == 'PUT':
        data = request.get_json()
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            update_fields = []
            values = []
            
            if 'username' in data:
                update_fields.append('username = ?')
                values.append(data['username'])
            if 'password' in data and data['password']:
                update_fields.append('password_hash = ?')
                values.append(generate_password_hash(data['password']))
            if 'role' in data:
                if data['role'] not in ROLES:
                    conn.close()
                    return jsonify({'success': False, 'error': 'Invalid role'}), 400
                update_fields.append('role = ?')
                values.append(data['role'])
            
            values.append(user_id)
            
            query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = ?"
            c.execute(query, values)
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'User not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'error': 'Username already exists'}), 409
    
    else:  # DELETE
        # Prevent deleting yourself
        if session.get('user_id') == user_id:
            return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 400
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            c.execute('DELETE FROM users WHERE id = ?', (user_id,))
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'User not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except Exception as e:
            conn.close()
            return jsonify({'success': False, 'error': str(e)}), 500

# User preferences endpoints
@app.route('/api/user/preferences', methods=['GET'])
@login_required
def get_user_preferences():
    """Get current user's preferences"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT timezone, dark_mode FROM users WHERE id = ?', (session['user_id'],))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({
        'timezone': row[0] or 'UTC',
        'dark_mode': bool(row[1]) if row[1] is not None else False
    })

@app.route('/api/user/preferences', methods=['PUT'])
@login_required
def update_user_preferences():
    """Update current user's preferences"""
    data = request.get_json()
    
    # Build update query dynamically based on provided fields
    update_fields = []
    values = []
    
    if 'timezone' in data:
        # Validate timezone
        try:
            pytz.timezone(data['timezone'])
            update_fields.append('timezone = ?')
            values.append(data['timezone'])
        except pytz.exceptions.UnknownTimeZoneError:
            return jsonify({'success': False, 'error': 'Invalid timezone'}), 400
    
    if 'dark_mode' in data:
        # Validate dark_mode is boolean
        if not isinstance(data['dark_mode'], bool):
            return jsonify({'success': False, 'error': 'Invalid dark_mode value'}), 400
        update_fields.append('dark_mode = ?')
        values.append(1 if data['dark_mode'] else 0)
    
    if not update_fields:
        return jsonify({'success': False, 'error': 'No valid fields to update'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        values.append(session['user_id'])
        query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = ?"
        c.execute(query, values)
        
        if c.rowcount == 0:
            conn.close()
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/timezones', methods=['GET'])
@login_required
def get_timezones():
    """Get list of common timezones"""
    # Return commonly used timezones grouped by region
    timezones = {
        'US': [
            'US/Eastern',
            'US/Central', 
            'US/Mountain',
            'US/Pacific',
            'US/Alaska',
            'US/Hawaii'
        ],
        'Europe': [
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Europe/Amsterdam',
            'Europe/Brussels',
            'Europe/Madrid',
            'Europe/Rome',
            'Europe/Stockholm',
            'Europe/Zurich'
        ],
        'Asia': [
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Hong_Kong',
            'Asia/Singapore',
            'Asia/Dubai',
            'Asia/Kolkata',
            'Asia/Seoul',
            'Asia/Bangkok'
        ],
        'Australia': [
            'Australia/Sydney',
            'Australia/Melbourne',
            'Australia/Brisbane',
            'Australia/Perth',
            'Australia/Adelaide'
        ],
        'Americas': [
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'America/Toronto',
            'America/Vancouver',
            'America/Mexico_City',
            'America/Sao_Paulo',
            'America/Argentina/Buenos_Aires'
        ],
        'Other': [
            'UTC',
            'GMT',
            'Pacific/Auckland'
        ]
    }
    
    return jsonify(timezones)

def update_version_data(technology, component_name, version, metadata=None):
    """Update version data in database"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    timestamp = datetime.now().isoformat()
    metadata_json = json.dumps(metadata) if metadata else None
    
    # Insert or update current version
    c.execute('''INSERT OR REPLACE INTO versions 
                 (technology, component_name, version, last_updated, metadata)
                 VALUES (?, ?, ?, ?, ?)''',
              (technology, component_name, version, timestamp, metadata_json))
    
    # Add to history
    c.execute('''INSERT INTO version_history 
                 (technology, component_name, version, timestamp, metadata)
                 VALUES (?, ?, ?, ?, ?)''',
              (technology, component_name, version, timestamp, metadata_json))
    
    conn.commit()
    conn.close()

def update_sync_status(technology, status, message=""):
    """Update the last sync status for a technology"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    timestamp = datetime.now().isoformat()
    c.execute('''INSERT OR REPLACE INTO last_sync 
                 (technology, last_sync_time, status, message)
                 VALUES (?, ?, ?, ?)''',
              (technology, timestamp, status, message))
    
    conn.commit()
    conn.close()

def collect_vsphere_data():
    """Collect vSphere (vCenter and ESXi) version data"""
    print(f"Starting vSphere data collection at {datetime.now()}")
    
    try:
        collector = VSphereCollector()
        results = collector.collect_all()
        
        for result in results:
            update_version_data(
                technology='vsphere',
                component_name=result['name'],
                version=result['version'],
                metadata=result.get('metadata', {})
            )
        
        update_sync_status('vsphere', 'success', f'Collected {len(results)} components')
        print(f"vSphere data collection completed: {len(results)} components")
        return {'success': True, 'count': len(results)}
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error collecting vSphere data: {error_msg}")
        update_sync_status('vsphere', 'error', error_msg)
        return {'success': False, 'error': error_msg}

def collect_nsx_data():
    """Collect NSX-T version data"""
    print(f"Starting NSX-T data collection at {datetime.now()}")
    
    try:
        collector = NSXCollector()
        results = collector.collect_all()
        
        for result in results:
            update_version_data(
                technology='nsx-t',
                component_name=result['name'],
                version=result['version'],
                metadata=result.get('metadata', {})
            )
        
        update_sync_status('nsx-t', 'success', f'Collected {len(results)} components')
        print(f"NSX-T data collection completed: {len(results)} components")
        return {'success': True, 'count': len(results)}
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error collecting NSX-T data: {error_msg}")
        update_sync_status('nsx-t', 'error', error_msg)
        return {'success': False, 'error': error_msg}

def collect_vcd_data():
    """Collect vCD version data"""
    print(f"Starting vCD data collection at {datetime.now()}")
    
    try:
        collector = VCDCollector()
        results = collector.collect_all()
        
        for result in results:
            update_version_data(
                technology='vcd',
                component_name=result['name'],
                version=result['version'],
                metadata=result.get('metadata', {})
            )
        
        update_sync_status('vcd', 'success', f'Collected {len(results)} components')
        print(f"vCD data collection completed: {len(results)} components")
        return {'success': True, 'count': len(results)}
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error collecting vCD data: {error_msg}")
        update_sync_status('vcd', 'error', error_msg)
        return {'success': False, 'error': error_msg}

def collect_usage_meter_data():
    """Collect Usage Meter version data"""
    print(f"Starting Usage Meter data collection at {datetime.now()}")
    
    try:
        collector = UsageMeterCollector()
        results = collector.collect_all()
        
        for result in results:
            update_version_data(
                technology='usage-meter',
                component_name=result['name'],
                version=result['version'],
                metadata=result.get('metadata', {})
            )
        
        update_sync_status('usage-meter', 'success', f'Collected {len(results)} components')
        print(f"Usage Meter data collection completed: {len(results)} components")
        return {'success': True, 'count': len(results)}
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error collecting Usage Meter data: {error_msg}")
        update_sync_status('usage-meter', 'error', error_msg)
        return {'success': False, 'error': error_msg}

# Public endpoints (no auth required)
@app.route('/api/technologies', methods=['GET'])
@login_required
def get_technologies():
    """Get list of tracked technologies"""
    return jsonify(['vSphere', 'NSX-T', 'vCloud Director', 'Usage Meter'])

@app.route('/api/versions/<technology>', methods=['GET'])
@login_required
def get_versions(technology):
    """Get all version data for a specific technology"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('''SELECT component_name, version, last_updated, metadata 
                 FROM versions 
                 WHERE technology = ?
                 ORDER BY component_name''', (technology,))
    
    rows = c.fetchall()
    conn.close()
    
    versions = []
    for row in rows:
        metadata = json.loads(row[3]) if row[3] else {}
        versions.append({
            'component_name': row[0],
            'version': row[1],
            'last_updated': row[2],
            'metadata': metadata
        })
    
    return jsonify(versions)

@app.route('/api/sync-status', methods=['GET'])
@login_required
def get_sync_status():
    """Get sync status for all technologies"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('SELECT technology, last_sync_time, status, message FROM last_sync')
    rows = c.fetchall()
    conn.close()
    
    status = {}
    for row in rows:
        status[row[0]] = {
            'last_sync_time': row[1],
            'status': row[2],
            'message': row[3]
        }
    
    return jsonify(status)

@app.route('/api/version-history/<technology>', methods=['GET'])
@login_required
def get_version_history(technology):
    """Get version history for a specific technology"""
    component = request.args.get('component')
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    if component:
        c.execute('''SELECT component_name, version, timestamp, metadata
                     FROM version_history
                     WHERE technology = ? AND component_name = ?
                     ORDER BY timestamp DESC
                     LIMIT 100''', (technology, component))
    else:
        c.execute('''SELECT component_name, version, timestamp, metadata
                     FROM version_history
                     WHERE technology = ?
                     ORDER BY timestamp DESC
                     LIMIT 100''', (technology,))
    
    rows = c.fetchall()
    conn.close()
    
    history = []
    for row in rows:
        metadata = json.loads(row[3]) if row[3] else {}
        history.append({
            'component_name': row[0],
            'version': row[1],
            'timestamp': row[2],
            'metadata': metadata
        })
    
    return jsonify(history)

@app.route('/api/vsphere/clusters', methods=['GET'])
@login_required
def get_vsphere_clusters():
    """Get cluster information from vSphere data"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Fix: Add space after colon in JSON LIKE pattern
    c.execute('''SELECT component_name, version, last_updated, metadata 
                 FROM versions 
                 WHERE technology = ? AND metadata LIKE ?
                 ORDER BY component_name''', ('vsphere', '%"type": "cluster"%'))
    
    rows = c.fetchall()
    
    clusters = []
    for row in rows:
        metadata = json.loads(row[3]) if row[3] else {}
        cluster_full_name = row[0]
        # Remove " (Cluster)" suffix to get the actual cluster name used in host metadata
        cluster_name = cluster_full_name.replace(' (Cluster)', '')
        
        # Get ESXi hosts in this cluster to aggregate versions and hardware
        c.execute('''SELECT version, metadata 
                     FROM versions 
                     WHERE technology = ? AND metadata LIKE ?''',
                  ('vsphere', f'%"cluster": "{cluster_name}"%'))
        
        host_rows = c.fetchall()
        versions = set()
        hardware_vendors = set()
        
        for host_row in host_rows:
            host_metadata = json.loads(host_row[1]) if host_row[1] else {}
            # Double-check the cluster name matches
            if host_metadata.get('cluster') == cluster_name:
                versions.add(host_row[0])
                vendor = host_metadata.get('hardware_vendor', 'Unknown')
                if vendor and vendor != 'Unknown':
                    hardware_vendors.add(vendor)
        
        clusters.append({
            'name': cluster_full_name,
            'version': row[1],
            'last_updated': row[2],
            'vcenter': metadata.get('vcenter', 'Unknown'),
            'environment': metadata.get('environment', 'Production'),
            'host_count': metadata.get('host_count', 0),
            'vm_count': metadata.get('vm_count', 0),
            'drs_enabled': metadata.get('drs_enabled', False),
            'drs_automation': metadata.get('drs_automation', 'Unknown'),
            'ha_enabled': metadata.get('ha_enabled', False),
            'evc_mode': metadata.get('evc_mode', 'Disabled'),
            'update_method': metadata.get('update_method', 'Unknown'),
            'compliance_status': metadata.get('compliance_status', 'Unknown'),
            'lifecycle_details': metadata.get('lifecycle_details', ''),
            'versions': sorted(list(versions), reverse=True) if versions else [],
            'hardware_vendors': sorted(list(hardware_vendors)) if hardware_vendors else []
        })
    
    conn.close()
    return jsonify(clusters)

# Pull data endpoints (require pull permission)
@app.route('/api/pull/<technology>', methods=['POST'])
@login_required
@require_permission('pull')
def pull_data(technology):
    """Manually trigger data collection for a technology"""
    collectors = {
        'vsphere': collect_vsphere_data,
        'nsx-t': collect_nsx_data,
        'vcd': collect_vcd_data,
        'usage-meter': collect_usage_meter_data
    }
    
    collector = collectors.get(technology)
    if not collector:
        return jsonify({'success': False, 'error': 'Unknown technology'}), 400
    
    result = collector()
    return jsonify(result)

# vCenter configuration endpoints (require config permission)
@app.route('/api/vcenter-configs', methods=['GET'])
@login_required
@require_permission('config')
def get_vcenter_configs():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('''SELECT id, vcenter_name, hostname, username, enabled, created_at, updated_at
                 FROM vcenter_configs ORDER BY vcenter_name''')
    rows = c.fetchall()
    conn.close()
    
    configs = []
    for row in rows:
        configs.append({
            'id': row[0],
            'vcenter_name': row[1],
            'hostname': row[2],
            'username': row[3],
            'enabled': bool(row[4]),
            'created_at': row[5],
            'updated_at': row[6]
        })
    
    return jsonify(configs)

@app.route('/api/vcenter-configs', methods=['POST'])
@login_required
@require_permission('config')
def create_vcenter_config():
    data = request.get_json()
    
    required_fields = ['vcenter_name', 'hostname', 'username', 'password']
    for field in required_fields:
        if field not in data:
            return jsonify({'success': False, 'error': f'Missing field: {field}'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        timestamp = datetime.now().isoformat()
        
        c.execute('''INSERT INTO vcenter_configs 
                     (vcenter_name, hostname, username, password, enabled, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)''',
                  (data['vcenter_name'], data['hostname'], data['username'], 
                   data['password'], data.get('enabled', True), timestamp, timestamp))
        
        conn.commit()
        config_id = c.lastrowid
        conn.close()
        
        return jsonify({'success': True, 'id': config_id}), 201
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'vCenter with this name already exists'}), 409

@app.route('/api/vcenter-configs/<int:config_id>', methods=['PUT', 'DELETE'])
@login_required
@require_permission('config')
def vcenter_config_operations(config_id):
    if request.method == 'PUT':
        data = request.get_json()
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            timestamp = datetime.now().isoformat()
            
            update_fields = []
            values = []
            
            if 'vcenter_name' in data:
                update_fields.append('vcenter_name = ?')
                values.append(data['vcenter_name'])
            if 'hostname' in data:
                update_fields.append('hostname = ?')
                values.append(data['hostname'])
            if 'username' in data:
                update_fields.append('username = ?')
                values.append(data['username'])
            if 'password' in data and data['password']:
                update_fields.append('password = ?')
                values.append(data['password'])
            if 'enabled' in data:
                update_fields.append('enabled = ?')
                values.append(data['enabled'])
            
            update_fields.append('updated_at = ?')
            values.append(timestamp)
            values.append(config_id)
            
            query = f"UPDATE vcenter_configs SET {', '.join(update_fields)} WHERE id = ?"
            c.execute(query, values)
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'error': 'vCenter with this name already exists'}), 409
    
    else:  # DELETE
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            c.execute('DELETE FROM vcenter_configs WHERE id = ?', (config_id,))
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except Exception as e:
            conn.close()
            return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/vcenter-configs/<int:config_id>/test', methods=['POST'])
@login_required
@require_permission('config')
def test_vcenter_connection(config_id):
    """Test a vCenter connection"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('SELECT hostname, username, password FROM vcenter_configs WHERE id = ?', (config_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'success': False, 'error': 'Configuration not found'}), 404
    
    hostname, username, password = row
    
    try:
        collector = VSphereCollector()
        version = collector.test_connection(hostname, username, password)
        
        if version:
            return jsonify({'success': True, 'message': f'Connection successful - vCenter version: {version}'})
        else:
            return jsonify({'success': False, 'error': 'Failed to retrieve version information'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# NSX Configuration endpoints
@app.route('/api/nsx-configs', methods=['GET'])
@login_required
@require_permission('config')
def get_nsx_configs():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('''SELECT id, manager_name, hostname, username, environment, enabled, created_at, updated_at
                 FROM nsx_configs ORDER BY manager_name''')
    rows = c.fetchall()
    conn.close()
    
    configs = []
    for row in rows:
        configs.append({
            'id': row[0],
            'manager_name': row[1],
            'hostname': row[2],
            'username': row[3],
            'environment': row[4],
            'enabled': bool(row[5]),
            'created_at': row[6],
            'updated_at': row[7]
        })
    
    return jsonify(configs)

@app.route('/api/nsx-configs', methods=['POST'])
@login_required
@require_permission('config')
def create_nsx_config():
    data = request.get_json()
    
    required_fields = ['manager_name', 'hostname', 'username', 'password']
    for field in required_fields:
        if field not in data:
            return jsonify({'success': False, 'error': f'Missing field: {field}'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        timestamp = datetime.now().isoformat()
        
        c.execute('''INSERT INTO nsx_configs 
                     (manager_name, hostname, username, password, environment, enabled, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                  (data['manager_name'], data['hostname'], data['username'], 
                   data['password'], data.get('environment', 'Production'), 
                   data.get('enabled', True), timestamp, timestamp))
        
        conn.commit()
        config_id = c.lastrowid
        conn.close()
        
        return jsonify({'success': True, 'id': config_id}), 201
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'NSX Manager with this name already exists'}), 409

@app.route('/api/nsx-configs/<int:config_id>', methods=['PUT', 'DELETE'])
@login_required
@require_permission('config')
def nsx_config_operations(config_id):
    if request.method == 'PUT':
        data = request.get_json()
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            timestamp = datetime.now().isoformat()
            
            update_fields = []
            values = []
            
            if 'manager_name' in data:
                update_fields.append('manager_name = ?')
                values.append(data['manager_name'])
            if 'hostname' in data:
                update_fields.append('hostname = ?')
                values.append(data['hostname'])
            if 'username' in data:
                update_fields.append('username = ?')
                values.append(data['username'])
            if 'password' in data and data['password']:
                update_fields.append('password = ?')
                values.append(data['password'])
            if 'environment' in data:
                update_fields.append('environment = ?')
                values.append(data['environment'])
            if 'enabled' in data:
                update_fields.append('enabled = ?')
                values.append(data['enabled'])
            
            update_fields.append('updated_at = ?')
            values.append(timestamp)
            values.append(config_id)
            
            query = f"UPDATE nsx_configs SET {', '.join(update_fields)} WHERE id = ?"
            c.execute(query, values)
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'error': 'NSX Manager with this name already exists'}), 409
    
    else:  # DELETE
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            c.execute('DELETE FROM nsx_configs WHERE id = ?', (config_id,))
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except Exception as e:
            conn.close()
            return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/nsx-configs/<int:config_id>/test', methods=['POST'])
@login_required
@require_permission('config')
def test_nsx_connection(config_id):
    """Test an NSX Manager connection"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('SELECT hostname, username, password FROM nsx_configs WHERE id = ?', (config_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'success': False, 'error': 'Configuration not found'}), 404
    
    hostname, username, password = row
    
    try:
        collector = NSXCollector()
        version = collector.test_connection(hostname, username, password)
        
        if version:
            return jsonify({'success': True, 'message': f'Connection successful - NSX version: {version}'})
        else:
            return jsonify({'success': False, 'error': 'Failed to retrieve version information'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# vCD Configuration endpoints
@app.route('/api/vcd-configs', methods=['GET'])
@login_required
@require_permission('config')
def get_vcd_configs():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('''SELECT id, vcd_name, hostname, username, org, environment, enabled, created_at, updated_at
                 FROM vcd_configs ORDER BY vcd_name''')
    rows = c.fetchall()
    conn.close()
    
    configs = []
    for row in rows:
        configs.append({
            'id': row[0],
            'vcd_name': row[1],
            'hostname': row[2],
            'username': row[3],
            'org': row[4],
            'environment': row[5],
            'enabled': bool(row[6]),
            'created_at': row[7],
            'updated_at': row[8]
        })
    
    return jsonify(configs)

@app.route('/api/vcd-configs', methods=['POST'])
@login_required
@require_permission('config')
def create_vcd_config():
    data = request.get_json()
    
    required_fields = ['vcd_name', 'hostname', 'username', 'password']
    for field in required_fields:
        if field not in data:
            return jsonify({'success': False, 'error': f'Missing field: {field}'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        timestamp = datetime.now().isoformat()
        
        c.execute('''INSERT INTO vcd_configs 
                     (vcd_name, hostname, username, password, org, environment, enabled, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (data['vcd_name'], data['hostname'], data['username'], 
                   data['password'], data.get('org', 'System'), 
                   data.get('environment', 'Production'), 
                   data.get('enabled', True), timestamp, timestamp))
        
        conn.commit()
        config_id = c.lastrowid
        conn.close()
        
        return jsonify({'success': True, 'id': config_id}), 201
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'vCD with this name already exists'}), 409

@app.route('/api/vcd-configs/<int:config_id>', methods=['PUT', 'DELETE'])
@login_required
@require_permission('config')
def vcd_config_operations(config_id):
    if request.method == 'PUT':
        data = request.get_json()
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            timestamp = datetime.now().isoformat()
            
            update_fields = []
            values = []
            
            if 'vcd_name' in data:
                update_fields.append('vcd_name = ?')
                values.append(data['vcd_name'])
            if 'hostname' in data:
                update_fields.append('hostname = ?')
                values.append(data['hostname'])
            if 'username' in data:
                update_fields.append('username = ?')
                values.append(data['username'])
            if 'password' in data and data['password']:
                update_fields.append('password = ?')
                values.append(data['password'])
            if 'org' in data:
                update_fields.append('org = ?')
                values.append(data['org'])
            if 'environment' in data:
                update_fields.append('environment = ?')
                values.append(data['environment'])
            if 'enabled' in data:
                update_fields.append('enabled = ?')
                values.append(data['enabled'])
            
            update_fields.append('updated_at = ?')
            values.append(timestamp)
            values.append(config_id)
            
            query = f"UPDATE vcd_configs SET {', '.join(update_fields)} WHERE id = ?"
            c.execute(query, values)
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'error': 'vCD with this name already exists'}), 409
    
    else:  # DELETE
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            c.execute('DELETE FROM vcd_configs WHERE id = ?', (config_id,))
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except Exception as e:
            conn.close()
            return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/vcd-configs/<int:config_id>/test', methods=['POST'])
@login_required
@require_permission('config')
def test_vcd_connection(config_id):
    """Test a vCD connection"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('SELECT hostname, username, password, org FROM vcd_configs WHERE id = ?', (config_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'success': False, 'error': 'Configuration not found'}), 404
    
    hostname, username, password, org = row
    
    try:
        collector = VCDCollector()
        version = collector.test_connection(hostname, username, password, org)
        
        if version:
            return jsonify({'success': True, 'message': f'Connection successful - vCD version: {version}'})
        else:
            return jsonify({'success': False, 'error': 'Failed to retrieve version information'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# Usage Meter Configuration endpoints
@app.route('/api/usage-meter-configs', methods=['GET'])
@login_required
@require_permission('config')
def get_usage_meter_configs():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('''SELECT id, meter_name, hostname, username, environment, enabled, created_at, updated_at
                 FROM usage_meter_configs ORDER BY meter_name''')
    rows = c.fetchall()
    conn.close()
    
    configs = []
    for row in rows:
        configs.append({
            'id': row[0],
            'meter_name': row[1],
            'hostname': row[2],
            'username': row[3],
            'environment': row[4],
            'enabled': bool(row[5]),
            'created_at': row[6],
            'updated_at': row[7]
        })
    
    return jsonify(configs)

@app.route('/api/usage-meter-configs', methods=['POST'])
@login_required
@require_permission('config')
def create_usage_meter_config():
    data = request.get_json()
    
    required_fields = ['meter_name', 'hostname', 'username', 'password']
    for field in required_fields:
        if field not in data:
            return jsonify({'success': False, 'error': f'Missing field: {field}'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        timestamp = datetime.now().isoformat()
        
        c.execute('''INSERT INTO usage_meter_configs 
                     (meter_name, hostname, username, password, environment, enabled, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                  (data['meter_name'], data['hostname'], data['username'], 
                   data['password'], data.get('environment', 'Production'), 
                   data.get('enabled', True), timestamp, timestamp))
        
        conn.commit()
        config_id = c.lastrowid
        conn.close()
        
        return jsonify({'success': True, 'id': config_id}), 201
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'Usage Meter with this name already exists'}), 409

@app.route('/api/usage-meter-configs/<int:config_id>', methods=['PUT', 'DELETE'])
@login_required
@require_permission('config')
def usage_meter_config_operations(config_id):
    if request.method == 'PUT':
        data = request.get_json()
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            timestamp = datetime.now().isoformat()
            
            update_fields = []
            values = []
            
            if 'meter_name' in data:
                update_fields.append('meter_name = ?')
                values.append(data['meter_name'])
            if 'hostname' in data:
                update_fields.append('hostname = ?')
                values.append(data['hostname'])
            if 'username' in data:
                update_fields.append('username = ?')
                values.append(data['username'])
            if 'password' in data and data['password']:
                update_fields.append('password = ?')
                values.append(data['password'])
            if 'environment' in data:
                update_fields.append('environment = ?')
                values.append(data['environment'])
            if 'enabled' in data:
                update_fields.append('enabled = ?')
                values.append(data['enabled'])
            
            update_fields.append('updated_at = ?')
            values.append(timestamp)
            values.append(config_id)
            
            query = f"UPDATE usage_meter_configs SET {', '.join(update_fields)} WHERE id = ?"
            c.execute(query, values)
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'error': 'Usage Meter with this name already exists'}), 409
    
    else:  # DELETE
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        try:
            c.execute('DELETE FROM usage_meter_configs WHERE id = ?', (config_id,))
            
            if c.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Configuration not found'}), 404
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        
        except Exception as e:
            conn.close()
            return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/usage-meter-configs/<int:config_id>/test', methods=['POST'])
@login_required
@require_permission('config')
def test_usage_meter_connection(config_id):
    """Test a Usage Meter connection"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('SELECT hostname, username, password FROM usage_meter_configs WHERE id = ?', (config_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'success': False, 'error': 'Configuration not found'}), 404
    
    hostname, username, password = row
    
    try:
        collector = UsageMeterCollector()
        
        # First, authenticate and get token
        token = collector.get_auth_token(hostname, username, password)
        
        if not token:
            # Try to get more details about the auth failure
            import requests
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            try:
                # Attempt to get error details using Basic Auth
                response = requests.post(
                    f"https://{hostname}/api/v2/auth",
                    auth=(username, password),
                    headers={'Accept': 'application/json'},
                    verify=False,
                    timeout=10
                )
                error_msg = f"Authentication failed (HTTP {response.status_code})"
                try:
                    error_detail = response.text[:200]
                    if error_detail:
                        error_msg += f": {error_detail}"
                except:
                    pass
                return jsonify({'success': False, 'error': error_msg})
            except Exception as e:
                return jsonify({'success': False, 'error': f'Authentication failed: {str(e)}'})
        
        # Then get version info using the token
        version_info = collector.get_meter_version(hostname, token)
        
        if version_info:
            return jsonify({
                'success': True, 
                'message': f'Connection successful - {version_info["full_name"]} (Build {version_info["build"]})'
            })
        else:
            return jsonify({'success': False, 'error': 'Failed to retrieve version information'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# SSL Certificate Management Endpoints

@app.route('/api/ssl/status', methods=['GET'])
@login_required
@require_permission('config')
def get_ssl_status():
    """Get current SSL certificate status"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT cert_path, key_path, cert_info, is_self_signed, created_at, expires_at, uploaded_at FROM ssl_config WHERE id = 1')
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({
            'enabled': SSL_ENABLED,
            'configured': False
        })
    
    cert_path, key_path, cert_info_json, is_self_signed, created_at, expires_at, uploaded_at = row
    cert_info = json.loads(cert_info_json) if cert_info_json else {}
    
    # Check if certificate files exist
    cert_exists = os.path.exists(cert_path)
    key_exists = os.path.exists(key_path)
    
    return jsonify({
        'enabled': SSL_ENABLED,
        'configured': True,
        'cert_exists': cert_exists,
        'key_exists': key_exists,
        'cert_path': cert_path,
        'key_path': key_path,
        'cert_info': cert_info,
        'is_self_signed': bool(is_self_signed),
        'created_at': created_at,
        'expires_at': expires_at,
        'uploaded_at': uploaded_at
    })

@app.route('/api/ssl/upload', methods=['POST'])
@login_required
@require_permission('config')
def upload_ssl_certificate():
    """Upload a new SSL certificate and private key"""
    
    if 'certificate' not in request.files or 'private_key' not in request.files:
        return jsonify({'success': False, 'error': 'Both certificate and private key files are required'}), 400
    
    cert_file = request.files['certificate']
    key_file = request.files['private_key']
    
    if not cert_file.filename or not key_file.filename:
        return jsonify({'success': False, 'error': 'No files selected'}), 400
    
    # Create ssl directory if it doesn't exist
    ssl_dir = 'ssl'
    os.makedirs(ssl_dir, exist_ok=True)
    
    # Save files temporarily
    temp_cert_path = os.path.join(ssl_dir, 'temp_cert.pem')
    temp_key_path = os.path.join(ssl_dir, 'temp_key.pem')
    
    try:
        cert_file.save(temp_cert_path)
        key_file.save(temp_key_path)
        
        # Validate the certificate and key pair
        from ssl_manager import validate_certificate_pair, get_certificate_info
        
        is_valid, message = validate_certificate_pair(temp_cert_path, temp_key_path)
        
        if not is_valid:
            os.remove(temp_cert_path)
            os.remove(temp_key_path)
            return jsonify({'success': False, 'error': message}), 400
        
        # Get certificate information
        cert_info = get_certificate_info(temp_cert_path)
        
        if not cert_info:
            os.remove(temp_cert_path)
            os.remove(temp_key_path)
            return jsonify({'success': False, 'error': 'Failed to read certificate information'}), 400
        
        # Move files to final location
        final_cert_path = os.path.join(ssl_dir, 'cert.pem')
        final_key_path = os.path.join(ssl_dir, 'key.pem')
        
        # Backup existing files if they exist
        if os.path.exists(final_cert_path):
            os.rename(final_cert_path, os.path.join(ssl_dir, 'cert.pem.backup'))
        if os.path.exists(final_key_path):
            os.rename(final_key_path, os.path.join(ssl_dir, 'key.pem.backup'))
        
        os.rename(temp_cert_path, final_cert_path)
        os.rename(temp_key_path, final_key_path)
        
        # Set proper permissions
        os.chmod(final_key_path, 0o600)
        os.chmod(final_cert_path, 0o644)
        
        # Update database
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Delete existing config
        c.execute('DELETE FROM ssl_config')
        
        c.execute('''INSERT INTO ssl_config 
                     (id, cert_path, key_path, cert_info, is_self_signed, created_at, expires_at, uploaded_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                  (1, final_cert_path, final_key_path, json.dumps(cert_info),
                   1 if cert_info.get('is_self_signed') else 0,
                   datetime.now().isoformat(),
                   cert_info.get('not_after'),
                   datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Certificate uploaded successfully. Restart the application to apply changes.',
            'cert_info': cert_info
        })
    
    except Exception as e:
        # Clean up temp files
        if os.path.exists(temp_cert_path):
            os.remove(temp_cert_path)
        if os.path.exists(temp_key_path):
            os.remove(temp_key_path)
        
        return jsonify({'success': False, 'error': f'Upload failed: {str(e)}'}), 500

@app.route('/api/ssl/regenerate', methods=['POST'])
@login_required
@require_permission('config')
def regenerate_self_signed():
    """Regenerate self-signed certificate"""
    try:
        from ssl_manager import generate_self_signed_cert
        
        data = request.get_json() or {}
        hostname = data.get('hostname', 'localhost')
        validity_days = data.get('validity_days', 365)
        
        cert_path, key_path = generate_self_signed_cert(
            common_name=hostname,
            validity_days=validity_days
        )
        
        return jsonify({
            'success': True,
            'message': 'Self-signed certificate regenerated successfully. Restart the application to apply changes.',
            'cert_path': cert_path,
            'key_path': key_path
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to generate certificate: {str(e)}'}), 500

# LDAP Configuration Endpoints

@app.route('/api/ldap/config', methods=['GET'])
@login_required
@require_permission('config')
def get_ldap_config():
    """Get LDAP configuration (password excluded)"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''SELECT enabled, server, port, use_ssl, base_dn, bind_dn, 
                        user_search_filter, user_search_base, group_search_base,
                        group_membership_attribute
                 FROM ldap_config WHERE id = 1''')
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'configured': False})
    
    return jsonify({
        'configured': True,
        'enabled': bool(row[0]),
        'server': row[1],
        'port': row[2],
        'use_ssl': bool(row[3]),
        'base_dn': row[4],
        'bind_dn': row[5],
        'user_search_filter': row[6],
        'user_search_base': row[7],
        'group_search_base': row[8],
        'group_membership_attribute': row[9]
    })

@app.route('/api/ldap/config', methods=['POST', 'PUT'])
@login_required
@require_permission('config')
def save_ldap_config():
    """Save or update LDAP configuration"""
    global ldap_auth
    data = request.get_json()
    
    required_fields = ['server', 'port', 'base_dn', 'bind_dn', 'bind_password']
    for field in required_fields:
        if field not in data:
            return jsonify({'success': False, 'error': f'Missing field: {field}'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        timestamp = datetime.now().isoformat()
        
        # Check if config exists
        c.execute('SELECT id FROM ldap_config WHERE id = 1')
        exists = c.fetchone()
        
        if exists:
            # Update existing config
            c.execute('''UPDATE ldap_config SET
                        enabled = ?, server = ?, port = ?, use_ssl = ?,
                        base_dn = ?, bind_dn = ?, bind_password = ?,
                        user_search_filter = ?, user_search_base = ?,
                        group_search_base = ?, group_membership_attribute = ?,
                        updated_at = ?
                        WHERE id = 1''',
                     (data.get('enabled', 0), data['server'], data['port'], 
                      data.get('use_ssl', 0), data['base_dn'], data['bind_dn'], 
                      data['bind_password'], data.get('user_search_filter', '(sAMAccountName={username})'),
                      data.get('user_search_base'), data.get('group_search_base'),
                      data.get('group_membership_attribute', 'memberOf'), timestamp))
        else:
            # Insert new config
            c.execute('''INSERT INTO ldap_config 
                        (id, enabled, server, port, use_ssl, base_dn, bind_dn, bind_password,
                         user_search_filter, user_search_base, group_search_base, 
                         group_membership_attribute, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                     (1, data.get('enabled', 0), data['server'], data['port'],
                      data.get('use_ssl', 0), data['base_dn'], data['bind_dn'], 
                      data['bind_password'], data.get('user_search_filter', '(sAMAccountName={username})'),
                      data.get('user_search_base'), data.get('group_search_base'),
                      data.get('group_membership_attribute', 'memberOf'), timestamp, timestamp))
        
        conn.commit()
        conn.close()
        
        # Reload LDAP authenticator
        ldap_auth = LDAPAuthenticator()
        
        return jsonify({'success': True, 'message': 'LDAP configuration saved successfully'})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ldap/test', methods=['POST'])
@login_required
@require_permission('config')
def test_ldap_connection():
    """Test LDAP connection with current configuration"""
    global ldap_auth
    
    # Reload config before testing
    ldap_auth = LDAPAuthenticator()
    
    success, message = ldap_auth.test_connection()
    
    return jsonify({
        'success': success,
        'message': message
    })

@app.route('/api/ldap/groups/search', methods=['POST'])
@login_required
@require_permission('config')
def search_ldap_groups():
    """Search for LDAP groups"""
    global ldap_auth
    data = request.get_json()
    pattern = data.get('pattern', '*')
    
    if ldap_auth is None:
        ldap_auth = LDAPAuthenticator()
    
    groups = ldap_auth.search_groups(pattern)
    return jsonify({'groups': groups})

@app.route('/api/ldap/mappings', methods=['GET'])
@login_required
@require_permission('config')
def get_group_mappings():
    """Get all LDAP group to role mappings"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, ldap_group_dn, site_role, created_at FROM ldap_group_mappings ORDER BY site_role, ldap_group_dn')
    rows = c.fetchall()
    conn.close()
    
    mappings = []
    for row in rows:
        mappings.append({
            'id': row[0],
            'ldap_group_dn': row[1],
            'site_role': row[2],
            'created_at': row[3]
        })
    
    return jsonify({'mappings': mappings})

@app.route('/api/ldap/mappings', methods=['POST'])
@login_required
@require_permission('config')
def add_group_mapping():
    """Add a new LDAP group to role mapping"""
    global ldap_auth
    data = request.get_json()
    
    if 'ldap_group_dn' not in data or 'site_role' not in data:
        return jsonify({'success': False, 'error': 'Missing ldap_group_dn or site_role'}), 400
    
    if data['site_role'] not in ROLES:
        return jsonify({'success': False, 'error': 'Invalid site role'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        timestamp = datetime.now().isoformat()
        c.execute('''INSERT INTO ldap_group_mappings (ldap_group_dn, site_role, created_at)
                     VALUES (?, ?, ?)''',
                  (data['ldap_group_dn'], data['site_role'], timestamp))
        mapping_id = c.lastrowid
        conn.commit()
        conn.close()
        
        # Reload LDAP authenticator to pick up new mapping
        ldap_auth = LDAPAuthenticator()
        
        return jsonify({'success': True, 'id': mapping_id})
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'This LDAP group is already mapped'}), 409
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ldap/mappings/<int:mapping_id>', methods=['DELETE'])
@login_required
@require_permission('config')
def delete_group_mapping(mapping_id):
    """Delete an LDAP group mapping"""
    global ldap_auth
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM ldap_group_mappings WHERE id = ?', (mapping_id,))
    conn.commit()
    conn.close()
    
    # Reload LDAP authenticator
    ldap_auth = LDAPAuthenticator()
    
    return jsonify({'success': True})

# Scheduler setup
def start_scheduler():
    """Start the background scheduler for daily updates"""
    scheduler = BackgroundScheduler()
    
    # Schedule collections daily at 2 AM
    scheduler.add_job(
        func=collect_vsphere_data,
        trigger="cron",
        hour=2,
        minute=0,
        id='vsphere_daily_collection'
    )
    
    scheduler.add_job(
        func=collect_nsx_data,
        trigger="cron",
        hour=2,
        minute=15,
        id='nsx_daily_collection'
    )
    
    scheduler.add_job(
        func=collect_vcd_data,
        trigger="cron",
        hour=2,
        minute=30,
        id='vcd_daily_collection'
    )
    
    scheduler.add_job(
        func=collect_usage_meter_data,
        trigger="cron",
        hour=2,
        minute=45,
        id='usage_meter_daily_collection'
    )
    
    scheduler.start()
    print("Scheduler started - Daily collections at 2:00 AM")

if __name__ == '__main__':
    init_db()
    start_scheduler()
    
    # Generate self-signed certificate if SSL is enabled and no certificate exists
    if SSL_ENABLED and not os.path.exists(SSL_CERT_PATH):
        print("\nGenerating self-signed SSL certificate...")
        try:
            from ssl_manager import generate_self_signed_cert
            generate_self_signed_cert()
        except ImportError as e:
            print(f"Warning: Could not generate SSL certificate: {e}")
            print("SSL will be disabled. Install cryptography package to enable SSL.")
    
    print("=" * 60)
    print("Databank Vera Automation Hub Backend")
    print("=" * 60)
    print("Backend started successfully!")
    
    if SSL_ENABLED:
        print(f"Web UI: https://localhost:3000")
        print(f"API: https://localhost:5000")
        print("\nSSL: ENABLED (HTTPS)")
        if os.path.exists(SSL_CERT_PATH):
            print(f"Certificate: {SSL_CERT_PATH}")
        else:
            print("Certificate: NOT FOUND")
    else:
        print(f"Web UI: http://localhost:3000")
        print(f"API: http://localhost:5000")
        print("\nSSL: DISABLED (HTTP)")
    
    print("")
    print("Configured Technologies:")
    print("  - vSphere (vCenter + ESXi)")
    print("  - NSX-T")
    print("  - vCloud Director")
    print("  - Usage Meter")
    print("")
    print("Scheduled pulls: Daily at 2:00 AM")
    print("")
    print("Default login: admin / admin")
    print("=" * 60)
    
    if SSL_ENABLED and os.path.exists(SSL_CERT_PATH) and os.path.exists(SSL_KEY_PATH):
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(SSL_CERT_PATH, SSL_KEY_PATH)
        app.run(debug=True, host='0.0.0.0', port=5000, ssl_context=ssl_context, use_reloader=False)
    else:
        app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
