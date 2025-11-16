"""
vSphere Collector - vCenter, ESXi Host, and Cluster Version Tracking
Connects to vCenter instances and collects version information for vCenters, ESXi hosts, and clusters
"""
from pyVim.connect import SmartConnect, Disconnect
from pyVmomi import vim
import ssl
import sqlite3
import os
import requests
import urllib3
from datetime import datetime

# Disable SSL warnings for vCenter API calls
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class VSphereCollector:
    def __init__(self, db_path='version_data.db'):
        """Initialize vSphere collector with database connection"""
        self.db_path = db_path
        self.vcenters = []
        self.load_config()
    
    def load_config(self):
        """Load vCenter configuration from database"""
        # Determine the correct path to the database
        if os.path.exists(self.db_path):
            db_file = self.db_path
        else:
            # Try relative path from backend directory
            db_file = os.path.join(os.path.dirname(__file__), '..', self.db_path)
        
        if not os.path.exists(db_file):
            print(f"Warning: Database not found at {db_file}")
            print("Please configure vCenter connections via the web interface")
            return
        
        try:
            conn = sqlite3.connect(db_file)
            c = conn.cursor()
            
            # Get all enabled vCenter configurations
            c.execute('''SELECT vcenter_name, hostname, username, password 
                         FROM vcenter_configs 
                         WHERE enabled = 1''')
            
            for row in c.fetchall():
                self.vcenters.append({
                    'vcenter_name': row[0],
                    'hostname': row[1],
                    'username': row[2],
                    'password': row[3]
                })
            
            conn.close()
            
            print(f"Loaded {len(self.vcenters)} enabled vCenter configurations from database")
            
        except sqlite3.Error as e:
            print(f"Database error loading vCenter configs: {str(e)}")
        except Exception as e:
            print(f"Error loading vCenter configs: {str(e)}")
    
    def connect_vcenter(self, hostname, username, password):
        """Connect to vCenter server"""
        context = ssl._create_unverified_context()
        
        try:
            si = SmartConnect(
                host=hostname,
                user=username,
                pwd=password,
                sslContext=context
            )
            return si
        except Exception as e:
            print(f"Failed to connect to {hostname}: {str(e)}")
            return None
    
    def get_vcenter_version(self, si):
        """Get vCenter version information"""
        content = si.RetrieveContent()
        return {
            'version': content.about.version,
            'build': content.about.build,
            'full_name': content.about.fullName,
            'api_version': content.about.apiVersion
        }
    
    def get_cluster_tags(self, si, cluster):
        """Get tags for a cluster, specifically looking for 'environment' category"""
        try:
            # Try to get tags if tagging is available
            # Note: This requires vSphere 6.0+ with tagging enabled
            tag_manager = si.content.customFieldsManager
            if hasattr(cluster, 'tag') and cluster.tag:
                return cluster.tag
            
            # Alternative: Look for custom attributes
            if hasattr(cluster, 'customValue') and cluster.customValue:
                tags = {}
                for custom_val in cluster.customValue:
                    field = next((f for f in tag_manager.field if f.key == custom_val.key), None)
                    if field and field.name.lower() == 'environment':
                        tags['environment'] = custom_val.value
                return tags
            
            return {}
        except Exception as e:
            print(f"Warning: Could not retrieve tags for cluster: {str(e)}")
            return {}
    
    def get_cluster_lifecycle_mode(self, hostname, username, password, cluster_moref):
        """
        Get cluster lifecycle management mode (vLCM or VUM) and compliance status
        Returns dict with lifecycle_mode, update_method, compliance_status, and details
        """
        try:
            # Create session for REST API calls
            session = requests.Session()
            session.verify = False  # Disable SSL verification
            
            # Authenticate to get session token
            auth_url = f"https://{hostname}/api/session"
            
            try:
                auth_response = session.post(auth_url, auth=(username, password), timeout=10)
            except requests.exceptions.Timeout:
                print(f"    REST API timeout connecting to {hostname}")
                return {
                    'lifecycle_mode': 'Unknown',
                    'update_method': 'Unknown', 
                    'compliance_status': 'Unknown',
                    'details': 'API timeout'
                }
            except requests.exceptions.ConnectionError as e:
                print(f"    REST API connection error to {hostname}: {str(e)[:100]}")
                return {
                    'lifecycle_mode': 'Unknown',
                    'update_method': 'Unknown', 
                    'compliance_status': 'Unknown',
                    'details': 'Connection error'
                }
            
            if auth_response.status_code != 201:
                print(f"    REST API auth failed for {hostname}: HTTP {auth_response.status_code}")
                return {
                    'lifecycle_mode': 'Unknown',
                    'update_method': 'Unknown', 
                    'compliance_status': 'Unknown',
                    'details': f'Auth failed: {auth_response.status_code}'
                }
            
            # Get session token
            try:
                session_token = auth_response.json()
                session.headers.update({'vmware-api-session-id': session_token})
            except Exception as e:
                print(f"    Failed to parse session token: {str(e)}")
                return {
                    'lifecycle_mode': 'Unknown',
                    'update_method': 'Unknown', 
                    'compliance_status': 'Unknown',
                    'details': 'Token parse error'
                }
            
            # Try to get vLCM software specification
            vlcm_url = f"https://{hostname}/api/esx/settings/clusters/{cluster_moref}/software"
            
            try:
                vlcm_response = session.get(vlcm_url, timeout=10)
            except requests.exceptions.Timeout:
                print(f"    vLCM API timeout for cluster {cluster_moref}")
                return {
                    'lifecycle_mode': 'Unknown',
                    'update_method': 'Unknown', 
                    'compliance_status': 'Unknown',
                    'details': 'vLCM API timeout'
                }
            
            if vlcm_response.status_code == 404:
                # vLCM API not available (pre-vSphere 7.0 or feature not enabled)
                print(f"    vLCM API not available (HTTP 404) - assuming VUM")
                return {
                    'lifecycle_mode': 'VUM',
                    'update_method': 'VUM',
                    'compliance_status': 'N/A',
                    'details': 'vLCM not available'
                }
            elif vlcm_response.status_code == 200:
                try:
                    vlcm_data = vlcm_response.json()
                except Exception as e:
                    print(f"    Failed to parse vLCM response: {str(e)}")
                    return {
                        'lifecycle_mode': 'Unknown',
                        'update_method': 'Unknown', 
                        'compliance_status': 'Unknown',
                        'details': 'Response parse error'
                    }
                
                # Check if cluster has vLCM image configured
                if vlcm_data and 'base_image' in vlcm_data and vlcm_data['base_image']:
                    base_image = vlcm_data['base_image']
                    image_version = base_image.get('version', 'Unknown')
                    
                    # Get compliance status
                    compliance_url = f"https://{hostname}/api/esx/settings/clusters/{cluster_moref}/software/compliance"
                    compliance_status = 'Unknown'
                    
                    try:
                        compliance_response = session.get(compliance_url, timeout=10)
                        if compliance_response.status_code == 200:
                            compliance_data = compliance_response.json()
                            compliance_status = compliance_data.get('status', 'Unknown')
                    except Exception as e:
                        print(f"    Warning: Could not get compliance status: {str(e)[:50]}")
                    
                    # Count add-on components
                    component_count = 0
                    if 'add_on' in vlcm_data and vlcm_data['add_on']:
                        add_on = vlcm_data['add_on']
                        if 'components' in add_on and add_on['components']:
                            component_count = len(add_on['components'])
                    
                    details = f"ESXi {image_version}"
                    if component_count > 0:
                        details += f" + {component_count} component(s)"
                    
                    return {
                        'lifecycle_mode': 'vLCM',
                        'update_method': 'vLCM',
                        'compliance_status': compliance_status,
                        'details': details,
                        'image_version': image_version
                    }
                else:
                    # No vLCM image configured, assume VUM
                    return {
                        'lifecycle_mode': 'VUM',
                        'update_method': 'VUM',
                        'compliance_status': 'N/A',
                        'details': 'No vLCM image'
                    }
            else:
                # Other error status
                print(f"    vLCM API returned HTTP {vlcm_response.status_code}")
                return {
                    'lifecycle_mode': 'Unknown',
                    'update_method': 'Unknown',
                    'compliance_status': 'Unknown',
                    'details': f'API error: {vlcm_response.status_code}'
                }
            
        except requests.exceptions.RequestException as e:
            print(f"    REST API error: {str(e)[:100]}")
            return {
                'lifecycle_mode': 'Unknown',
                'update_method': 'Unknown',
                'compliance_status': 'Unknown',
                'details': f'API error'
            }
        except Exception as e:
            print(f"    Unexpected error checking lifecycle mode: {str(e)[:100]}")
            import traceback
            traceback.print_exc()
            return {
                'lifecycle_mode': 'Unknown',
                'update_method': 'Unknown',
                'compliance_status': 'Unknown',
                'details': f'Error'
            }
        finally:
            if 'session' in locals():
                try:
                    session.close()
                except:
                    pass
    
    def get_clusters(self, si, vcenter_name):
        """Get cluster information as standalone components"""
        content = si.RetrieveContent()
        
        cluster_container = content.viewManager.CreateContainerView(
            content.rootFolder, [vim.ClusterComputeResource], True
        )
        
        # Get vCenter hostname and credentials for REST API calls
        vcenter_config = next((v for v in self.vcenters if v['vcenter_name'] == vcenter_name), None)
        hostname = vcenter_config['hostname'] if vcenter_config else None
        username = vcenter_config['username'] if vcenter_config else None
        password = vcenter_config['password'] if vcenter_config else None
        
        clusters = []
        for cluster in cluster_container.view:
            try:
                tags = self.get_cluster_tags(si, cluster)
                
                # Get DRS settings
                drs_enabled = False
                drs_automation = 'Unknown'
                if hasattr(cluster, 'configuration') and hasattr(cluster.configuration, 'drsConfig'):
                    drs_config = cluster.configuration.drsConfig
                    drs_enabled = drs_config.enabled if hasattr(drs_config, 'enabled') else False
                    
                    if hasattr(drs_config, 'defaultVmBehavior'):
                        behavior = drs_config.defaultVmBehavior
                        if behavior == 'fullyAutomated':
                            drs_automation = 'Fully Automated'
                        elif behavior == 'partiallyAutomated':
                            drs_automation = 'Partially Automated'
                        elif behavior == 'manual':
                            drs_automation = 'Manual'
                        else:
                            drs_automation = str(behavior)
                
                # Get HA settings
                ha_enabled = False
                if hasattr(cluster, 'configuration') and hasattr(cluster.configuration, 'dasConfig'):
                    das_config = cluster.configuration.dasConfig
                    ha_enabled = das_config.enabled if hasattr(das_config, 'enabled') else False
                
                # Get EVC mode
                evc_mode = 'Disabled'
                if hasattr(cluster, 'summary') and hasattr(cluster.summary, 'currentEVCModeKey'):
                    evc_key = cluster.summary.currentEVCModeKey
                    if evc_key and evc_key != '':
                        evc_mode = evc_key
                
                # Count hosts in cluster
                host_count = 0
                vm_count = 0
                if hasattr(cluster, 'host'):
                    host_count = len(cluster.host)
                    # Count VMs across all hosts in cluster
                    for host in cluster.host:
                        if hasattr(host, 'vm'):
                            vm_count += len(host.vm)
                
                # Get cluster version (typically the lowest host version)
                cluster_version = 'Unknown'
                if hasattr(cluster, 'summary') and hasattr(cluster.summary, 'currentEVCModeKey'):
                    # Try to get version from hosts
                    if hasattr(cluster, 'host') and cluster.host:
                        versions = []
                        for host in cluster.host:
                            if hasattr(host, 'config') and hasattr(host.config, 'product'):
                                versions.append(host.config.product.version)
                        if versions:
                            cluster_version = min(versions)  # Lowest version in cluster
                
                # Get lifecycle management mode (vLCM or VUM)
                lifecycle_info = {
                    'lifecycle_mode': 'Unknown',
                    'update_method': 'Unknown',
                    'compliance_status': 'Unknown',
                    'details': 'Not checked'
                }
                
                if hostname and username and password:
                    try:
                        # Get cluster MoRef ID
                        cluster_moref = cluster._moId
                        print(f"  Checking lifecycle mode for cluster {cluster.name} (MoRef: {cluster_moref})...")
                        lifecycle_info = self.get_cluster_lifecycle_mode(
                            hostname, username, password, cluster_moref
                        )
                        print(f"    Result: {lifecycle_info['update_method']} - {lifecycle_info['details']}")
                    except Exception as e:
                        print(f"    Error checking lifecycle mode for {cluster.name}: {str(e)}")
                        import traceback
                        traceback.print_exc()
                else:
                    print(f"  Skipping lifecycle check for {cluster.name} - missing credentials")
                
                clusters.append({
                    'name': cluster.name,
                    'version': cluster_version,
                    'vcenter': vcenter_name,
                    'environment': tags.get('environment', 'Untagged'),
                    'host_count': host_count,
                    'vm_count': vm_count,
                    'drs_enabled': drs_enabled,
                    'drs_automation': drs_automation,
                    'ha_enabled': ha_enabled,
                    'evc_mode': evc_mode,
                    'update_method': lifecycle_info['update_method'],
                    'compliance_status': lifecycle_info['compliance_status'],
                    'lifecycle_details': lifecycle_info['details']
                })
                
            except Exception as e:
                print(f"Error getting cluster info for {cluster.name}: {str(e)}")
        
        cluster_container.Destroy()
        return clusters
    
    def get_host_versions(self, si):
        """Get ESXi host version information including cluster and environment tags"""
        content = si.RetrieveContent()
        
        # First, get all clusters and their tags
        cluster_container = content.viewManager.CreateContainerView(
            content.rootFolder, [vim.ClusterComputeResource], True
        )
        
        cluster_info = {}
        for cluster in cluster_container.view:
            try:
                tags = self.get_cluster_tags(si, cluster)
                
                # Get DRS settings
                drs_enabled = False
                drs_automation = 'Unknown'
                if hasattr(cluster, 'configuration') and hasattr(cluster.configuration, 'drsConfig'):
                    drs_config = cluster.configuration.drsConfig
                    drs_enabled = drs_config.enabled if hasattr(drs_config, 'enabled') else False
                    
                    if hasattr(drs_config, 'defaultVmBehavior'):
                        behavior = drs_config.defaultVmBehavior
                        if behavior == 'fullyAutomated':
                            drs_automation = 'Fully Automated'
                        elif behavior == 'partiallyAutomated':
                            drs_automation = 'Partially Automated'
                        elif behavior == 'manual':
                            drs_automation = 'Manual'
                        else:
                            drs_automation = str(behavior)
                
                # Get HA settings
                ha_enabled = False
                if hasattr(cluster, 'configuration') and hasattr(cluster.configuration, 'dasConfig'):
                    das_config = cluster.configuration.dasConfig
                    ha_enabled = das_config.enabled if hasattr(das_config, 'enabled') else False
                
                # Get EVC mode
                evc_mode = 'Disabled'
                if hasattr(cluster, 'summary') and hasattr(cluster.summary, 'currentEVCModeKey'):
                    evc_key = cluster.summary.currentEVCModeKey
                    if evc_key and evc_key != '':
                        evc_mode = evc_key
                
                cluster_info[cluster.name] = {
                    'name': cluster.name,
                    'tags': tags,
                    'environment': tags.get('environment', 'Untagged'),
                    'drs_enabled': drs_enabled,
                    'drs_automation': drs_automation,
                    'ha_enabled': ha_enabled,
                    'evc_mode': evc_mode
                }
            except Exception as e:
                print(f"Error getting cluster info for {cluster.name}: {str(e)}")
                cluster_info[cluster.name] = {
                    'name': cluster.name,
                    'tags': {},
                    'environment': 'Untagged',
                    'drs_enabled': False,
                    'drs_automation': 'Unknown',
                    'ha_enabled': False,
                    'evc_mode': 'Disabled'
                }
        
        cluster_container.Destroy()
        
        # Now get hosts with cluster information
        host_container = content.viewManager.CreateContainerView(
            content.rootFolder, [vim.HostSystem], True
        )
        
        hosts = []
        for host in host_container.view:
            try:
                # Get cluster name
                cluster_name = 'Standalone'
                if hasattr(host, 'parent') and hasattr(host.parent, 'name'):
                    if isinstance(host.parent, vim.ClusterComputeResource):
                        cluster_name = host.parent.name
                
                # Get cluster info for environment and other settings
                cluster_data = cluster_info.get(cluster_name, {})
                environment = cluster_data.get('environment', 'Untagged')
                
                # Get hardware info
                hardware_vendor = 'Unknown'
                hardware_model = 'Unknown'
                serial_number = 'Unknown'
                
                if hasattr(host, 'hardware') and hasattr(host.hardware, 'systemInfo'):
                    system_info = host.hardware.systemInfo
                    hardware_vendor = system_info.vendor if hasattr(system_info, 'vendor') else 'Unknown'
                    hardware_model = system_info.model if hasattr(system_info, 'model') else 'Unknown'
                    
                    # Get serial number from UUID or service tag
                    if hasattr(system_info, 'serialNumber'):
                        serial_number = system_info.serialNumber
                    elif hasattr(system_info, 'uuid'):
                        serial_number = system_info.uuid
                
                # Count VMs on this host
                vm_count = 0
                if hasattr(host, 'vm'):
                    vm_count = len(host.vm)
                
                hosts.append({
                    'name': host.name,
                    'version': host.config.product.version,
                    'build': host.config.product.build,
                    'full_name': host.config.product.fullName,
                    'connection_state': str(host.runtime.connectionState),
                    'power_state': str(host.runtime.powerState),
                    'cluster': cluster_name,
                    'environment': environment,
                    'hardware_vendor': hardware_vendor,
                    'hardware_model': hardware_model,
                    'serial_number': serial_number,
                    'vm_count': vm_count,
                    'drs_enabled': cluster_data.get('drs_enabled', False),
                    'drs_automation': cluster_data.get('drs_automation', 'Unknown'),
                    'ha_enabled': cluster_data.get('ha_enabled', False),
                    'evc_mode': cluster_data.get('evc_mode', 'Disabled')
                })
            except Exception as e:
                print(f"Error getting info for host {host.name}: {str(e)}")
        
        host_container.Destroy()
        return hosts
    
    def test_connection(self, hostname, username, password):
        """Test connection to a vCenter and return version"""
        si = self.connect_vcenter(hostname, username, password)
        if not si:
            return None
        
        try:
            vcenter_info = self.get_vcenter_version(si)
            return vcenter_info['version']
        except Exception as e:
            print(f"Error testing connection: {str(e)}")
            return None
        finally:
            Disconnect(si)
    
    def collect_from_vcenter(self, vcenter_config):
        """Collect all data from a single vCenter"""
        results = []
        
        hostname = vcenter_config['hostname']
        username = vcenter_config['username']
        password = vcenter_config['password']
        vcenter_name = vcenter_config.get('vcenter_name', hostname)
        
        print(f"Connecting to vCenter: {vcenter_name} ({hostname})")
        
        si = self.connect_vcenter(hostname, username, password)
        if not si:
            return results
        
        try:
            # Get vCenter version
            vcenter_info = self.get_vcenter_version(si)
            results.append({
                'name': f"{vcenter_name} (vCenter)",
                'version': vcenter_info['version'],
                'metadata': {
                    'type': 'vcenter',
                    'build': vcenter_info['build'],
                    'full_name': vcenter_info['full_name'],
                    'api_version': vcenter_info['api_version'],
                    'hostname': hostname
                }
            })
            
            # Get cluster information
            clusters = self.get_clusters(si, vcenter_name)
            for cluster in clusters:
                results.append({
                    'name': f"{cluster['name']} (Cluster)",
                    'version': cluster['version'],
                    'metadata': {
                        'type': 'cluster',
                        'vcenter': vcenter_name,
                        'environment': cluster['environment'],
                        'host_count': cluster['host_count'],
                        'vm_count': cluster['vm_count'],
                        'drs_enabled': cluster['drs_enabled'],
                        'drs_automation': cluster['drs_automation'],
                        'ha_enabled': cluster['ha_enabled'],
                        'evc_mode': cluster['evc_mode'],
                        'update_method': cluster.get('update_method', 'Unknown'),
                        'compliance_status': cluster.get('compliance_status', 'Unknown'),
                        'lifecycle_details': cluster.get('lifecycle_details', '')
                    }
                })
            
            # Get ESXi host versions
            hosts = self.get_host_versions(si)
            for host in hosts:
                results.append({
                    'name': f"{host['name']} (ESXi)",
                    'version': host['version'],
                    'metadata': {
                        'type': 'esxi',
                        'build': host['build'],
                        'full_name': host['full_name'],
                        'connection_state': host['connection_state'],
                        'power_state': host['power_state'],
                        'vcenter': vcenter_name,
                        'cluster': host.get('cluster', 'Unknown'),
                        'environment': host.get('environment', 'Untagged'),
                        'hardware_vendor': host.get('hardware_vendor', 'Unknown'),
                        'hardware_model': host.get('hardware_model', 'Unknown'),
                        'serial_number': host.get('serial_number', 'Unknown'),
                        'vm_count': host.get('vm_count', 0),
                        'drs_enabled': host.get('drs_enabled', False),
                        'drs_automation': host.get('drs_automation', 'Unknown'),
                        'ha_enabled': host.get('ha_enabled', False),
                        'evc_mode': host.get('evc_mode', 'Disabled')
                    }
                })
            
            print(f"Collected data for {vcenter_name}: 1 vCenter + {len(clusters)} clusters + {len(hosts)} hosts")
            
        except Exception as e:
            print(f"Error collecting data from {vcenter_name}: {str(e)}")
        
        finally:
            Disconnect(si)
        
        return results
    
    def collect_all(self):
        """Collect data from all configured vCenters"""
        all_results = []
        
        if not self.vcenters:
            print("No vCenter configurations loaded")
            return all_results
        
        for vcenter_config in self.vcenters:
            results = self.collect_from_vcenter(vcenter_config)
            all_results.extend(results)
        
        return all_results

# For testing purposes
if __name__ == '__main__':
    collector = VSphereCollector()
    results = collector.collect_all()
    
    print(f"\nCollected {len(results)} total components:")
    for result in results:
        print(f"  {result['name']}: {result['version']}")
