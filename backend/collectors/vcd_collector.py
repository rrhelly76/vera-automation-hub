"""
vCloud Director (vCD) Collector
Collects version information from vCloud Director instances
"""
import sqlite3
import os
import requests
from requests.auth import HTTPBasicAuth
import urllib3
import re
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class VCDCollector:
    # API version to product version mapping
    API_VERSION_MAP = {
        '30.0': '9.1',
        '31.0': '9.5',
        '32.0': '9.7',
        '33.0': '10.0',
        '34.0': '10.1',
        '35.0': '10.2',
        '35.2': '10.2.2',
        '36.0': '10.3',
        '36.1': '10.3.1',
        '36.2': '10.3.2',
        '36.3': '10.3.3',
        '37.0': '10.4',
        '37.1': '10.4.1',
        '37.2': '10.4.2',
        '37.3': '10.4.3',
        '38.0': '10.5',
        '38.1': '10.5.1',
        '38.2': '10.5.2',
        '39.0': '10.6',
        '39.1': '10.6.1',
        '39.2': '10.6.2'
    }
    
    def __init__(self, db_path='version_data.db'):
        """Initialize vCD collector with database connection"""
        self.db_path = db_path
        self.vcd_instances = []
        self.load_config()
    
    def load_config(self):
        """Load vCD configuration from database"""
        if os.path.exists(self.db_path):
            db_file = self.db_path
        else:
            db_file = os.path.join(os.path.dirname(__file__), '..', self.db_path)
        
        if not os.path.exists(db_file):
            print(f"[WARNING] Database not found at {db_file}")
            return
        
        try:
            conn = sqlite3.connect(db_file)
            c = conn.cursor()
            
            c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='vcd_configs'")
            if not c.fetchone():
                print("[WARNING] vCD configs table not found")
                conn.close()
                return
            
            c.execute('''SELECT vcd_name, hostname, username, password, environment, org 
                         FROM vcd_configs 
                         WHERE enabled = 1''')
            
            rows = c.fetchall()
            
            if not rows:
                print("[WARNING] No enabled vCD instances found in database")
                conn.close()
                return
            
            for row in rows:
                self.vcd_instances.append({
                    'vcd_name': row[0],
                    'hostname': row[1],
                    'username': row[2],
                    'password': row[3],
                    'environment': row[4] if row[4] else 'Production',
                    'org': row[5] if row[5] else 'System'
                })
            
            conn.close()
            print(f"[SUCCESS] Loaded {len(self.vcd_instances)} enabled vCD configuration(s)")
            
        except Exception as e:
            print(f"[ERROR] Error loading vCD configurations: {str(e)}")
    
    def parse_api_version(self, version_str):
        """Parse API version string, handling alpha/beta versions"""
        try:
            # Remove alpha/beta suffixes and just get base version
            # e.g., '39.0.0-alpha-1709254007' -> '39.0'
            base_version = version_str.split('-')[0]
            
            # Convert to float for comparison (e.g., '39.0.1' -> 39.01)
            parts = base_version.split('.')
            if len(parts) >= 2:
                major = int(parts[0])
                minor = int(parts[1])
                patch = int(parts[2]) if len(parts) > 2 else 0
                return (major, minor, patch), base_version
            return (0, 0, 0), base_version
        except:
            return (0, 0, 0), version_str
    
    def get_supported_api_versions(self, hostname):
        """
        Get list of supported API versions from vCD
        """
        url = f"https://{hostname}/api/versions"
        
        try:
            response = requests.get(
                url,
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            # Parse XML to get supported versions
            versions = re.findall(r'<Version>([^<]+)</Version>', response.text)
            return versions
            
        except Exception as e:
            print(f"Error getting API versions from {hostname}: {str(e)}")
            return []
    
    def get_api_session(self, hostname, username, password, org):
        """
        Authenticate and get API session token
        Supports both CloudAPI (vCD 10.5+) and legacy API
        """
        # For vCD, username format is: username@org for org users, or username@system for system admin
        if '@' not in username:
            full_username = f"{username}@{org}"
        else:
            full_username = username
        
        # Get supported API versions to determine which endpoint to use
        supported_versions = self.get_supported_api_versions(hostname)
        
        if not supported_versions:
            print(f"Could not determine supported API versions for {hostname}")
            return None, None
        
        # Sort versions numerically to get the highest stable (non-alpha) version
        try:
            version_tuples = []
            for v in supported_versions:
                sort_key, base_v = self.parse_api_version(v)
                # Skip alpha/beta versions
                if 'alpha' not in v.lower() and 'beta' not in v.lower():
                    version_tuples.append((sort_key, base_v))
            
            if not version_tuples:
                # No stable versions found, use highest including alpha
                version_tuples = [self.parse_api_version(v) for v in supported_versions]
            
            version_tuples.sort(reverse=True)
            api_version = version_tuples[0][1]
            
            # Show top 3 versions for debugging
            top_versions = [vt[1] for vt in version_tuples[:3]]
            print(f"Using API version {api_version} (available: {', '.join(top_versions)})")
        except Exception as e:
            print(f"Error parsing API versions: {e}")
            api_version = '38.1'  # Default to newer version
        
        # Try CloudAPI first (vCD 10.3+, required for 10.5+)
        cloudapi_url = f"https://{hostname}/cloudapi/1.0.0/sessions/provider"
        
        try:
            response = requests.post(
                cloudapi_url,
                auth=HTTPBasicAuth(full_username, password),
                headers={
                    'Accept': f'application/json;version={api_version}'
                },
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            # Get session token from response header
            session_token = response.headers.get('X-VMWARE-VCLOUD-ACCESS-TOKEN')
            
            if session_token:
                return session_token, api_version
            
        except Exception as e:
            # CloudAPI failed, try legacy API
            print(f"CloudAPI auth failed, trying legacy API: {str(e)}")
        
        # Fallback to legacy API for older versions
        legacy_url = f"https://{hostname}/api/sessions"
        
        try:
            response = requests.post(
                legacy_url,
                auth=HTTPBasicAuth(full_username, password),
                headers={
                    'Accept': f'application/*+xml;version={api_version}'
                },
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            # Get session token from response header
            session_token = response.headers.get('X-VMWARE-VCLOUD-ACCESS-TOKEN')
            if not session_token:
                # Fallback to older auth token header
                session_token = response.headers.get('x-vcloud-authorization')
            
            if session_token:
                return session_token, api_version
            
        except Exception as e:
            print(f"Error authenticating to vCD {hostname}: {str(e)}")
        
        return None, None
    
    def get_vcd_version(self, hostname, session_token, api_version):
        """
        Get vCD version information
        Note: vCD API only exposes major.minor versions (e.g., 10.5.1), not patch versions (10.5.1.1) or build numbers
        """
        product_version = None
        
        # Try to get version from /api/session XML
        try:
            response = requests.get(
                f"https://{hostname}/api/session",
                headers={
                    'Accept': f'application/*+xml;version={api_version}',
                    'Authorization': f'Bearer {session_token}'
                },
                verify=False,
                timeout=30
            )
            
            if response.status_code == 200:
                # The session XML doesn't contain product version, just API version
                # We'll rely on API version mapping
                pass
        except Exception as e:
            pass
        
        # Map API version to product version (this is the most reliable method)
        product_version = self.API_VERSION_MAP.get(api_version, f"Unknown (API {api_version})")
        
        # Note: Patch versions (e.g., 10.5.1.1) and build numbers are not exposed via API
        # They can only be seen in the vCD UI under Help > About
        
        return {
            'version': product_version,
            'api_version': api_version,
            'full_name': f"vCloud Director {product_version}"
        }
    
    def get_system_info(self, hostname, session_token, api_version):
        """
        Get vCD system information
        Uses legacy API with Bearer token
        """
        # Try legacy API with Bearer token (works on vCD 10.3+)
        url = f"https://{hostname}/api/admin"
        
        try:
            response = requests.get(
                url,
                headers={
                    'Accept': 'application/*+xml;version=37.0',  # Use stable API version
                    'Authorization': f'Bearer {session_token}'
                },
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            content = response.text
            
            info = {}
            
            # Try to extract organization count
            org_match = re.findall(r'<OrgReference', content)
            if org_match:
                info['org_count'] = len(org_match)
            
            return info
            
        except Exception as e:
            # Not critical, just return empty dict
            return {}
    
    def get_orgs(self, hostname, session_token, api_version):
        """
        Get list of organizations in vCD
        Uses CloudAPI for newer versions with pagination support, legacy API for older versions
        """
        # Try CloudAPI first (JSON response with pagination)
        org_names = []
        page = 1
        page_size = 100  # Request more per page
        
        while True:
            cloudapi_url = f"https://{hostname}/cloudapi/1.0.0/orgs?page={page}&pageSize={page_size}"
            
            try:
                response = requests.get(
                    cloudapi_url,
                    headers={
                        'Accept': f'application/json;version={api_version}',
                        'Authorization': f'Bearer {session_token}'
                    },
                    verify=False,
                    timeout=30
                )
                response.raise_for_status()
                
                # Parse JSON response
                data = response.json()
                
                if 'values' in data:
                    for org in data['values']:
                        if 'displayName' in org:
                            org_names.append(org['displayName'])
                        elif 'name' in org:
                            org_names.append(org['name'])
                
                # Check if there are more pages
                page_count = data.get('pageCount', 1)
                
                if page >= page_count:
                    break
                
                page += 1
                
            except Exception as e:
                if page == 1:
                    # CloudAPI not available on first try, use legacy API
                    break
                else:
                    # Error on subsequent pages
                    print(f"Error getting orgs page {page}: {str(e)}")
                    break
        
        # If CloudAPI worked, return the results
        if org_names:
            return org_names
        
        # Try legacy API with Bearer token
        url = f"https://{hostname}/api/org"
        
        try:
            response = requests.get(
                url,
                headers={
                    'Accept': 'application/*+xml;version=37.0',  # Use stable API version
                    'Authorization': f'Bearer {session_token}'
                },
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            content = response.text
            
            # Extract organization names
            org_names = re.findall(r'name="([^"]+)"', content)
            
            return org_names
            
        except Exception as e:
            print(f"Error getting orgs from {hostname}: {str(e)}")
            return []
    
    def get_cells(self, hostname, session_token, api_version):
        """
        Get list of application cells in vCD
        Cells are the application servers running the vCD service
        """
        cells = []
        
        # Try CloudAPI endpoint first (newer vCD versions)
        cloudapi_url = f"https://{hostname}/cloudapi/1.0.0/cells"
        
        try:
            response = requests.get(
                cloudapi_url,
                headers={
                    'Accept': f'application/json;version={api_version}',
                    'Authorization': f'Bearer {session_token}'
                },
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            
            if 'values' in data:
                for cell in data['values']:
                    cells.append({
                        'name': cell.get('name', 'Unknown'),
                        'status': cell.get('status', 'Unknown'),
                        'is_active': cell.get('isActive', False),
                        'is_primary': cell.get('isPrimary', False),
                        'server_id': cell.get('id', ''),
                        'host': cell.get('host', '')
                    })
                return cells
                
        except Exception as e:
            # CloudAPI failed, try legacy API
            print(f"CloudAPI cells endpoint failed, trying legacy: {str(e)}")
        
        # Try legacy XML API endpoint
        legacy_url = f"https://{hostname}/api/admin/extension/cells"
        
        try:
            response = requests.get(
                legacy_url,
                headers={
                    'Accept': 'application/*+xml;version=37.0',
                    'Authorization': f'Bearer {session_token}'
                },
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            content = response.text
            
            # Parse XML response - cells are in <Cell> tags
            cell_blocks = re.findall(r'<Cell[^>]*>(.*?)</Cell>', content, re.DOTALL)
            
            for cell_block in cell_blocks:
                # Extract cell name
                name_match = re.search(r'name="([^"]+)"', cell_block)
                name = name_match.group(1) if name_match else 'Unknown'
                
                # Extract status
                status_match = re.search(r'<Status>([^<]+)</Status>', cell_block)
                status = status_match.group(1) if status_match else 'Unknown'
                
                # Extract is_active
                is_active_match = re.search(r'<IsActive>([^<]+)</IsActive>', cell_block)
                is_active = is_active_match.group(1).lower() == 'true' if is_active_match else False
                
                # Extract is_primary
                is_primary_match = re.search(r'<IsPrimary>([^<]+)</IsPrimary>', cell_block)
                is_primary = is_primary_match.group(1).lower() == 'true' if is_primary_match else False
                
                # Extract server_id (from href)
                id_match = re.search(r'id="([^"]+)"', cell_block)
                server_id = id_match.group(1) if id_match else ''
                
                cells.append({
                    'name': name,
                    'status': status,
                    'is_active': is_active,
                    'is_primary': is_primary,
                    'server_id': server_id,
                    'host': name  # Use name as host for legacy API
                })
            
            return cells
            
        except Exception as e:
            print(f"Error getting cells from {hostname}: {str(e)}")
            return []
    
    def test_connection(self, hostname, username, password, org):
        """Test connection to a vCD instance and return its version."""
        session_token, api_version = self.get_api_session(hostname, username, password, org)
        if not session_token:
            return None
        info = self.get_vcd_version(hostname, session_token, api_version)
        return info['version'] if info else None

    def collect_from_vcd(self, vcd_config):
        """Collect all data from a single vCD instance"""
        results = []
        
        hostname = vcd_config['hostname']
        username = vcd_config['username']
        password = vcd_config['password']
        vcd_name = vcd_config.get('vcd_name', hostname)
        environment = vcd_config.get('environment', 'Production')
        org = vcd_config.get('org', 'System')
        
        print(f"Connecting to vCD: {vcd_name} ({hostname})")
        
        # Get API session
        session_token, api_version = self.get_api_session(hostname, username, password, org)
        
        if not session_token:
            print(f"Failed to authenticate to {vcd_name}")
            return results
        
        # Get vCD version (maps API version to product version)
        version_info = self.get_vcd_version(hostname, session_token, api_version)
        
        if version_info:
            # Get system info
            system_info = self.get_system_info(hostname, session_token, api_version)
            
            # Get organizations
            orgs = self.get_orgs(hostname, session_token, api_version)
            
            # Get application cells
            cells = self.get_cells(hostname, session_token, api_version)
            
            # Add vCD instance
            results.append({
                'name': vcd_name,
                'version': version_info['version'],
                'metadata': {
                    'type': 'vcd-instance',
                    'api_version': version_info['api_version'],
                    'full_name': version_info['full_name'],
                    'hostname': hostname,
                    'environment': environment,
                    'org_count': system_info.get('org_count', len(orgs)),
                    'organizations': ', '.join(orgs) if orgs else 'N/A',
                    'cells': cells,
                    'cell_count': len(cells),
                    'version_note': 'API provides major.minor version only. Check vCD UI (Help > About) for exact patch version and build number.'
                }
            })
            
            print(f"Collected data for {vcd_name}: version {version_info['version']} (API {api_version}) with {len(orgs)} organizations and {len(cells)} cells")
        else:
            print(f"Failed to collect version data from {vcd_name}")
        
        return results
    
    def collect_all(self):
        """Collect data from all configured vCD instances"""
        all_results = []
        
        if not self.vcd_instances:
            print("No vCD configurations loaded")
            return all_results
        
        for vcd_config in self.vcd_instances:
            try:
                results = self.collect_from_vcd(vcd_config)
                all_results.extend(results)
            except Exception as e:
                print(f"Error collecting from {vcd_config.get('vcd_name', 'Unknown')}: {str(e)}")
                continue
        
        return all_results

if __name__ == '__main__':
    collector = VCDCollector()
    results = collector.collect_all()
    
    print(f"\nCollected {len(results)} total components:")
    for result in results:
        print(f"  {result['name']}: {result['version']}")
        print(f"    Organizations: {result['metadata'].get('org_count', 0)}")
