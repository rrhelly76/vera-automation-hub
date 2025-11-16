"""
VMware Usage Meter Collector
Collects version information and monitored products from Usage Meter instances
Uses OAuth2 Bearer token authentication (VCF Usage Meter 9.0+)
"""
import sqlite3
import os
import re
import requests
import urllib3
from datetime import datetime, timedelta
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class UsageMeterCollector:
    def __init__(self, db_path='version_data.db'):
        """Initialize Usage Meter collector with database connection"""
        self.db_path = db_path
        self.usage_meters = []
        self.tokens = {}  # Cache tokens per meter
        self.load_config()
    
    def load_config(self):
        """Load Usage Meter configuration from database"""
        if os.path.exists(self.db_path):
            db_file = self.db_path
        else:
            db_file = os.path.join(os.path.dirname(__file__), '..', self.db_path)
        
        if not os.path.exists(db_file):
            print(f"âš ï¸  Database not found at {db_file}")
            return
        
        try:
            conn = sqlite3.connect(db_file)
            c = conn.cursor()
            
            c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_meter_configs'")
            if not c.fetchone():
                print("âš ï¸  Usage Meter configs table not found")
                conn.close()
                return
            
            c.execute('''SELECT meter_name, hostname, username, password, environment 
                         FROM usage_meter_configs 
                         WHERE enabled = 1''')
            
            rows = c.fetchall()
            
            if not rows:
                print("âš ï¸  No enabled Usage Meters found in database")
                conn.close()
                return
            
            for row in rows:
                self.usage_meters.append({
                    'meter_name': row[0],
                    'hostname': row[1],
                    'username': row[2],
                    'password': row[3],
                    'environment': row[4] if row[4] else 'Production'
                })
            
            conn.close()
            print(f"âœ“ Loaded {len(self.usage_meters)} enabled Usage Meter configuration(s)")
            
        except Exception as e:
            print(f"âœ— Error loading Usage Meter configurations: {str(e)}")
    
    def get_auth_token(self, hostname, username, password):
        """
        Get OAuth2 Bearer token from Usage Meter
        Endpoint: POST /api/v2/auth (uses HTTP Basic Authentication)
        Per Broadcom documentation: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/usage-meter/9-0/
        Returns access_token with ~3 hour expiry
        
        Response structure:
        {
          "accessToken": {
            "tokenValue": "eyJ...",
            "expiresAt": "2025-10-29T02:13:44.682691214Z",
            "tokenType": {"value": "Bearer"}
          }
        }
        """
        # Check if we have a valid cached token
        cache_key = f"{hostname}:{username}"
        if cache_key in self.tokens:
            token_info = self.tokens[cache_key]
            if token_info['expires_at'] > datetime.now():
                print(f"  Using cached token for {hostname}")
                return token_info['token']
        
        # Correct endpoint per Broadcom docs: /api/v2/auth (not /api/v2/auth/token)
        url = f"https://{hostname}/api/v2/auth"
        
        try:
            # Use HTTP Basic Authentication as per official documentation
            response = requests.post(
                url,
                auth=(username, password),
                headers={'Accept': 'application/json'},
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            
            # Parse response for token
            access_token = None
            expires_in = 10800  # Default 3 hours
            
            try:
                data = response.json()
                
                # Handle nested structure: accessToken.tokenValue
                if 'accessToken' in data and isinstance(data['accessToken'], dict):
                    access_token = data['accessToken'].get('tokenValue')
                    
                    # Calculate expiry from expiresAt if available
                    expires_at_str = data['accessToken'].get('expiresAt')
                    if expires_at_str:
                        try:
                            from dateutil import parser
                            expires_at = parser.parse(expires_at_str)
                            expires_in = int((expires_at - datetime.now()).total_seconds())
                        except:
                            pass
                
                # Fallback to flat structure
                if not access_token:
                    access_token = data.get('access_token') or data.get('token')
                    expires_in = data.get('expires_in', 10800)
                    
            except Exception as e:
                print(f"  Error parsing token response: {e}")
                # Response might be plain text token
                if response.text and len(response.text) < 1000:
                    access_token = response.text.strip()
            
            if not access_token:
                print(f"âœ— No access_token in response from {hostname}")
                print(f"  Response: {response.text[:200]}")
                return None
            
            # Cache token with expiry (subtract 5 minutes for safety)
            expires_at = datetime.now() + timedelta(seconds=expires_in - 300)
            self.tokens[cache_key] = {
                'token': access_token,
                'expires_at': expires_at
            }
            
            print(f"  âœ“ Obtained new auth token (expires in {expires_in}s)")
            return access_token
            
        except requests.exceptions.HTTPError as e:
            print(f"âœ— Authentication failed for {hostname}: {e.response.status_code}")
            try:
                error_detail = e.response.text[:500]
                if error_detail:
                    print(f"  Response: {error_detail}")
            except:
                pass
            return None
        except Exception as e:
            print(f"âœ— Error getting auth token from {hostname}: {str(e)}")
            return None
    
    def get_meter_version(self, hostname, token):
        """Get Usage Meter version information - tries multiple endpoints"""
        
        # Try API endpoints first
        endpoints = [
            '/api/v1/agent_info',
            '/api/v2/agent_info', 
            '/api/v1/about',
            '/api/v1/system/info',
            '/api/v1/version'
        ]
        
        for endpoint in endpoints:
            url = f"https://{hostname}{endpoint}"
            
            try:
                response = requests.get(
                    url,
                    headers={
                        'Authorization': f'Bearer {token}',
                        'Accept': 'application/json'
                    },
                    verify=False,
                    timeout=30
                )
                
                if response.status_code != 200:
                    continue
                
                data = response.json()
                
                # Skip empty responses
                if not data or (isinstance(data, dict) and not data):
                    print(f"  {endpoint}: Empty response, trying next...")
                    continue
                
                print(f"  Found version data at {endpoint}")
                
                # Try multiple possible field names for version
                version = None
                build = None
                
                if isinstance(data, dict):
                    version = (data.get('version') or 
                              data.get('agentVersion') or 
                              data.get('productVersion') or
                              data.get('appVersion') or
                              data.get('serverVersion'))
                    
                    build = (data.get('buildNumber') or 
                            data.get('build') or 
                            data.get('buildNum') or
                            data.get('buildVersion'))
                    
                    # Some endpoints nest data
                    if not version and 'data' in data:
                        nested = data['data']
                        if isinstance(nested, dict):
                            version = (nested.get('version') or 
                                      nested.get('agentVersion') or
                                      nested.get('productVersion'))
                            build = nested.get('buildNumber') or nested.get('build')
                
                if version and version != 'Unknown':
                    print(f"  ✓ Extracted version: {version}, build: {build or 'Unknown'}")
                    return {
                        'version': version,
                        'build': build or 'Unknown',
                        'full_name': f"VCF Usage Meter {version}"
                    }
                    
            except requests.exceptions.HTTPError:
                continue
            except Exception:
                continue
        
        # If all JSON endpoints fail, try to parse HTML from /api/system/info
        try:
            url = f"https://{hostname}/api/system/info"
            response = requests.get(
                url,
                headers={'Authorization': f'Bearer {token}'},
                verify=False,
                timeout=30
            )
            
            if response.status_code == 200 and 'html' in response.text.lower():
                # Parse version from HTML title tag
                match = re.search(r'<title>.*?Usage Meter\s+(\d+\.\d+(?:\.\d+)?)', response.text, re.IGNORECASE)
                if match:
                    version = match.group(1)
                    print(f"  ✓ Extracted version from HTML: {version}")
                    return {
                        'version': version,
                        'build': 'Unknown',
                        'full_name': f"VCF Usage Meter {version}"
                    }
        except:
            pass
        
        # Final fallback - Usage Meter 9.0 is the current major version
        print(f"  ⚠️ Could not determine version, using default")
        return {
            'version': '9.0',
            'build': 'Unknown',
            'full_name': 'VCF Usage Meter 9.0'
        }
    
    def get_products_by_type(self, hostname, token, product_type):
        """
        Get products of a specific type from Usage Meter
        Endpoint: GET /api/v1/product?productType={type}
        Product types: vCenter, VCD, NSX-T, VROPS, NSX-V
        """
        url = f"https://{hostname}/api/v1/product"
        
        try:
            response = requests.get(
                url,
                params={'productType': product_type},
                headers={
                    'Authorization': f'Bearer {token}',
                    'Accept': 'application/json'
                },
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            # Response is a list of products
            products = []
            if isinstance(data, list):
                for product in data:
                    # Extract name - different products use different fields
                    # Priority: fullName (VROPS) > host (all products have this)
                    name = product.get('fullName') or product.get('host', 'Unknown')
                    
                    # Extract version - different products use different fields
                    if product_type == 'vCenter':
                        # vCenter uses vc_version field
                        version = product.get('vc_version', 'Unknown')
                    elif product_type == 'VCD':
                        # VCD uses buildNumber field
                        version = product.get('buildNumber', 'Unknown')
                    else:
                        # NSX-T, NSX-V, VROPS use version field
                        version = product.get('version', 'Unknown')
                    
                    # Extract hostname - use host field
                    hostname_field = product.get('host', 'Unknown')
                    
                    # Handle status - it may be an object or a string
                    status = product.get('status', 'Active')
                    if isinstance(status, dict):
                        # Status is an object like {code, lastChanged, level, statusCode, text}
                        # Use 'text' field as the status string
                        status = status.get('text') or status.get('statusCode') or 'Unknown'
                    
                    # Generate unique ID - use id field or UUID
                    unique_id = product.get('id')
                    if unique_id:
                        unique_id = f"{product_type}-{unique_id}"
                    else:
                        # Fallback to other unique identifiers
                        unique_id = (product.get('vc_instance_uuid') or 
                                   product.get('instanceUuid') or 
                                   f"{product_type}-{len(products)}")
                    
                    products.append({
                        'name': name,
                        'version': version,
                        'type': product_type,
                        'hostname': hostname_field,
                        'uuid': unique_id,
                        'status': status
                    })
            
            return products
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                # No products of this type
                return []
            print(f"  Error getting {product_type} products: {str(e)}")
            return []
        except Exception as e:
            print(f"  Error getting {product_type} products: {str(e)}")
            return []
    
    def get_all_monitored_products(self, hostname, token):
        """Get all monitored products across all types"""
        product_types = ['vCenter', 'VCD', 'NSX-T', 'VROPS', 'NSX-V']
        all_products = []
        
        for product_type in product_types:
            products = self.get_products_by_type(hostname, token, product_type)
            if products:
                print(f"  Found {len(products)} {product_type} product(s)")
            all_products.extend(products)
        
        return all_products
    
    def collect_from_meter(self, meter_config):
        """Collect all data from a single Usage Meter"""
        results = []
        
        hostname = meter_config['hostname']
        username = meter_config['username']
        password = meter_config['password']
        meter_name = meter_config.get('meter_name', hostname)
        environment = meter_config.get('environment', 'Production')
        
        print(f"\nConnecting to Usage Meter: {meter_name} ({hostname})")
        
        # Get OAuth2 token
        token = self.get_auth_token(hostname, username, password)
        if not token:
            print(f"âœ— Failed to authenticate to {meter_name}")
            return results
        
        # Get Usage Meter version
        meter_info = self.get_meter_version(hostname, token)
        if not meter_info:
            print(f"âœ— Failed to get version info from {meter_name}")
            return results
        
        # Get all monitored products
        products = self.get_all_monitored_products(hostname, token)
        
        # Add Usage Meter itself
        results.append({
            'name': meter_name,
            'version': meter_info['version'],
            'metadata': {
                'type': 'usage-meter',
                'build': meter_info['build'],
                'full_name': meter_info['full_name'],
                'hostname': hostname,
                'environment': environment,
                'product_count': len(products)
            }
        })
        
        # Add monitored products
        for product in products:
            # Create unique component name using type and UUID
            # This ensures uniqueness even if products have same hostname
            component_name = f"{meter_name} - {product['type']} - {product['uuid']}"
            
            results.append({
                'name': component_name,
                'version': product['version'],
                'metadata': {
                    'type': 'monitored-product',
                    'product_name': product['name'],
                    'product_hostname': product['hostname'],
                    'product_type': product['type'],
                    'product_uuid': product['uuid'],
                    'status': product['status'],
                    'meter': meter_name,
                    'environment': environment
                }
            })
        
        print(f"âœ“ Collected data for {meter_name}: 1 meter + {len(products)} monitored products")
        return results
    
    def collect_all(self):
        """Collect data from all configured Usage Meters"""
        all_results = []
        
        if not self.usage_meters:
            print("No Usage Meter configurations loaded")
            return all_results
        
        for meter_config in self.usage_meters:
            try:
                results = self.collect_from_meter(meter_config)
                all_results.extend(results)
            except Exception as e:
                print(f"âœ— Error collecting from {meter_config.get('meter_name', 'Unknown')}: {str(e)}")
                continue
        
        return all_results

if __name__ == '__main__':
    collector = UsageMeterCollector()
    results = collector.collect_all()
    
    print(f"\n{'='*60}")
    print(f"Collection Summary")
    print(f"{'='*60}")
    print(f"Total components collected: {len(results)}\n")
    
    # Group by type
    meters = [r for r in results if r['metadata']['type'] == 'usage-meter']
    products = [r for r in results if r['metadata']['type'] == 'monitored-product']
    
    print(f"Usage Meters: {len(meters)}")
    for meter in meters:
        print(f"  â€¢ {meter['name']}: {meter['version']} ({meter['metadata']['product_count']} products)")
    
    if products:
        print(f"\nMonitored Products: {len(products)}")
        by_type = {}
        for product in products:
            ptype = product['metadata']['product_type']
            by_type[ptype] = by_type.get(ptype, 0) + 1
        
        for ptype, count in sorted(by_type.items()):
            print(f"  â€¢ {ptype}: {count}")
