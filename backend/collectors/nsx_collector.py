"""
NSX-T Collector
Collects version information from NSX-T Managers and components
"""
import csv
import os
import sqlite3
import requests
from requests.auth import HTTPBasicAuth
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class NSXCollector:
    def __init__(self, db_path='version_data.db'):
        """Initialize NSX-T collector with database connection"""
        self.db_path = db_path
        self.managers = []
        self.load_config()
    
    def load_config(self):
        """
        Load NSX Manager configuration from database (configured via web UI)
        """
        # Determine the correct path to the database
        if os.path.exists(self.db_path):
            db_file = self.db_path
        else:
            # Try relative path from backend directory
            db_file = os.path.join(os.path.dirname(__file__), '..', self.db_path)
        
        if not os.path.exists(db_file):
            print(f"âŒ Database not found at {db_file}")
            print("   Please ensure backend is running and database is initialized")
            return
        
        try:
            conn = sqlite3.connect(db_file)
            c = conn.cursor()
            
            # Check if nsx_configs table exists
            c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='nsx_configs'")
            if not c.fetchone():
                print("âŒ NSX configs table not found in database")
                print("   Please restart the backend to create the table")
                conn.close()
                return
            
            # Get all enabled NSX Manager configurations
            c.execute('''SELECT manager_name, hostname, username, password, environment 
                         FROM nsx_configs 
                         WHERE enabled = 1''')
            
            rows = c.fetchall()
            
            if not rows:
                print("âš ï¸  No enabled NSX Managers found in database")
                print("   Please add NSX Managers via âš™ï¸ NSX Config page in web UI")
                print("   Make sure the 'Enabled' checkbox is checked!")
                conn.close()
                return
            
            for row in rows:
                self.managers.append({
                    'manager_name': row[0],
                    'hostname': row[1],
                    'username': row[2],
                    'password': row[3],
                    'environment': row[4] if row[4] else 'Production'
                })
            
            conn.close()
            print(f"âœ“ Loaded {len(self.managers)} enabled NSX Manager configuration(s) from database")
            
        except sqlite3.OperationalError as e:
            print(f"âŒ Database error: {str(e)}")
            print("   The nsx_configs table may not exist")
            print("   Please restart the backend to initialize the database")
        except Exception as e:
            print(f"âŒ Error loading NSX Manager configurations: {str(e)}")
            print("   Please ensure database is initialized and NSX Managers are configured via web UI")
    
    def get_manager_version(self, hostname, username, password):
        """
        Get NSX Manager version information
        
        NSX-T API endpoint: GET /api/v1/node/version
        """
        url = f"https://{hostname}/api/v1/node/version"
        
        try:
            response = requests.get(
                url,
                auth=HTTPBasicAuth(username, password),
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            return {
                'version': data.get('product_version', 'Unknown'),
                'build': data.get('node_version', 'Unknown'),
                'full_name': f"NSX-T {data.get('product_version', 'Unknown')}"
            }
        except requests.exceptions.Timeout:
            print(f"Timeout connecting to NSX Manager: {hostname}")
            return None
        except requests.exceptions.ConnectionError:
            print(f"Connection error to NSX Manager: {hostname}")
            return None
        except requests.exceptions.HTTPError as e:
            print(f"HTTP error from {hostname}: {e.response.status_code}")
            return None
        except Exception as e:
            print(f"Error getting NSX Manager version from {hostname}: {str(e)}")
            return None
    
    def get_edge_nodes(self, hostname, username, password):
        """
        Get Edge Node version information
        
        NSX-T API endpoint: GET /api/v1/transport-nodes
        """
        url = f"https://{hostname}/api/v1/transport-nodes"
        
        try:
            response = requests.get(
                url,
                auth=HTTPBasicAuth(username, password),
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            edge_nodes = []
            for node in data.get('results', []):
                # Edge nodes have resource_type of TransportNode with node_deployment_info
                if 'node_deployment_info' in node:
                    deployment_info = node.get('node_deployment_info', {})
                    
                    # Check if it's an Edge node
                    if deployment_info.get('resource_type') == 'EdgeNode':
                        edge_nodes.append({
                            'name': node.get('display_name', 'Unknown'),
                            'id': node.get('id', 'Unknown'),
                            'version': deployment_info.get('os_version', 'Unknown'),
                            'state': node.get('node_deployment_state', {}).get('state', 'Unknown'),
                            'deployment_type': deployment_info.get('deployment_type', 'Unknown'),
                            'form_factor': deployment_info.get('deployment_config', {}).get('form_factor', 'Unknown')
                        })
            
            return edge_nodes
        except requests.exceptions.Timeout:
            print(f"Timeout getting Edge Nodes from {hostname}")
            return []
        except requests.exceptions.ConnectionError:
            print(f"Connection error getting Edge Nodes from {hostname}")
            return []
        except Exception as e:
            print(f"Error getting Edge Nodes from {hostname}: {str(e)}")
            return []
    
    def get_transport_node_state(self, hostname, username, password, node_id):
        """
        Get detailed state for a specific transport node
        
        NSX-T API endpoint: GET /api/v1/transport-nodes/{node-id}/state
        
        This is needed because the state field is not always included in the 
        main transport-nodes list response
        """
        url = f"https://{hostname}/api/v1/transport-nodes/{node_id}/state"
        
        try:
            response = requests.get(
                url,
                auth=HTTPBasicAuth(username, password),
                verify=False,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            # The state endpoint returns detailed status
            state = data.get('state', 'unknown')
            return state
        except:
            # If the state endpoint fails, return unknown
            return 'unknown'
        
    def get_host_transport_nodes(self, hostname, username, password):
        """
        Get Host Transport Nodes (ESXi hosts in NSX fabric)
        
        NSX-T API endpoint: GET /api/v1/transport-nodes
        
        For host transport nodes that have node_deployment_info with resource_type='HostNode',
        the os_type and os_version are available directly in node_deployment_info.
        
        Host transport nodes can be identified by:
        1. No node_deployment_info (legacy), OR
        2. Has node_deployment_info but resource_type != 'EdgeNode'
        """
        url = f"https://{hostname}/api/v1/transport-nodes"
        
        try:
            response = requests.get(
                url,
                auth=HTTPBasicAuth(username, password),
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            host_nodes = []
            for node in data.get('results', []):
                # Determine if this is a host transport node or edge node
                is_host_node = False
                
                if 'node_deployment_info' in node:
                    # Node has deployment info - check if it's an Edge node
                    deployment_info = node.get('node_deployment_info', {})
                    resource_type = deployment_info.get('resource_type', '')
                    
                    # If it's NOT an EdgeNode, it's a host transport node
                    if resource_type != 'EdgeNode':
                        is_host_node = True
                else:
                    # No deployment info - this is a host transport node
                    is_host_node = True
                
                if not is_host_node:
                    # Skip Edge nodes
                    continue
                
                # This is a host transport node - extract its info
                node_id = node.get('id', 'Unknown')
                display_name = node.get('display_name', 'Unknown')
                
                # Get host details
                host_switch_spec = node.get('host_switch_spec', {})
                resource_type = host_switch_spec.get('resource_type', 'Unknown')
                
                # Get maintenance mode status
                maintenance_mode = node.get('maintenance_mode', 'DISABLED')
                
                # Get the state field from dedicated state endpoint
                # This is what NSX-T Manager shows as "NSX Configuration" status
                # Possible values: success, pending, in_progress, failed, partial_success, orphaned, unknown
                state = self.get_transport_node_state(hostname, username, password, node_id)
                
                # Initialize host info
                host_info = {
                    'name': display_name,
                    'id': node_id,
                    'state': state,
                    'maintenance_mode': maintenance_mode,
                    'resource_type': resource_type,
                    'os_type': 'Unknown',  # Default values
                    'os_version': 'Unknown'
                }
                
                # Get os_type and os_version from node_deployment_info
                # For host transport nodes, this data is in node_deployment_info, not node_properties
                node_deployment_info = node.get('node_deployment_info', {})
                if node_deployment_info:
                    # Check if this is a HostNode type (as opposed to EdgeNode)
                    if node_deployment_info.get('resource_type') == 'HostNode':
                        host_info['os_type'] = node_deployment_info.get('os_type', 'Unknown')
                        host_info['os_version'] = node_deployment_info.get('os_version', 'Unknown')
                        
                        # Also capture the discovered_node_id if present
                        if 'discovered_node_id' in node_deployment_info:
                            host_info['discovered_node_id'] = node_deployment_info['discovered_node_id']
                
                host_nodes.append(host_info)
            
            # Print summary
            if host_nodes:
                unknown_version_count = sum(1 for h in host_nodes if h['os_version'] == 'Unknown')
                unknown_os_type_count = sum(1 for h in host_nodes if h['os_type'] == 'Unknown')
                print(f"  Host node summary: {len(host_nodes)} total, {unknown_version_count} with Unknown version, {unknown_os_type_count} with Unknown os_type")
            
            return host_nodes
        except requests.exceptions.Timeout:
            print(f"Timeout getting Host Transport Nodes from {hostname}")
            return []
        except requests.exceptions.ConnectionError:
            print(f"Connection error getting Host Transport Nodes from {hostname}")
            return []
        except Exception as e:
            print(f"Error getting Host Transport Nodes from {hostname}: {str(e)}")
            return []
    
    def get_cluster_info(self, hostname, username, password):
        """
        Get NSX Manager cluster information
        
        NSX-T API endpoint: GET /api/v1/cluster/status
        """
        url = f"https://{hostname}/api/v1/cluster/status"
        
        try:
            response = requests.get(
                url,
                auth=HTTPBasicAuth(username, password),
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            return {
                'cluster_status': data.get('detailed_cluster_status', {}).get('overall_status', 'Unknown'),
                'mgmt_cluster_status': data.get('mgmt_cluster_status', {}).get('status', 'Unknown')
            }
        except Exception as e:
            print(f"Error getting cluster info from {hostname}: {str(e)}")
            return {
                'cluster_status': 'Unknown',
                'mgmt_cluster_status': 'Unknown'
            }
    
    def get_cluster_nodes(self, hostname, username, password):
        """
        Get individual NSX Manager nodes in the cluster
        
        NSX-T API endpoint: GET /api/v1/cluster/nodes
        
        Note: Filters out nodes with incomplete data (missing FQDN or version)
        to avoid duplicate entries with "Unknown" values
        """
        url = f"https://{hostname}/api/v1/cluster/nodes"
        
        try:
            response = requests.get(
                url,
                auth=HTTPBasicAuth(username, password),
                verify=False,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            nodes = []
            for node in data.get('results', []):
                fqdn = node.get('fqdn', 'Unknown')
                version = node.get('version', 'Unknown')
                
                # Skip nodes with missing critical data to avoid duplicates
                # This can happen with offline nodes or nodes being provisioned
                if fqdn == 'Unknown' or version == 'Unknown':
                    print(f"  âš ï¸  Skipping cluster node with incomplete data (FQDN: {fqdn}, Version: {version})")
                    continue
                
                nodes.append({
                    'fqdn': fqdn,
                    'ip_address': node.get('ip_address', 'Unknown'),
                    'version': version,
                    'role': node.get('role', 'Unknown')
                })
            
            return nodes
        except Exception as e:
            print(f"Error getting cluster nodes from {hostname}: {str(e)}")
            return []
    
    def test_connection(self, hostname, username, password):
        """Test connection to an NSX Manager and return its version."""
        info = self.get_manager_version(hostname, username, password)
        return info['version'] if info else None

    def collect_from_manager(self, manager_config):
        """Collect all data from a single NSX Manager"""
        results = []
        
        hostname = manager_config['hostname']
        username = manager_config['username']
        password = manager_config['password']
        manager_name = manager_config.get('manager_name', hostname)
        environment = manager_config.get('environment', 'Untagged')
        
        print(f"Connecting to NSX Manager: {manager_name} ({hostname})")
        
        # Get NSX Manager version
        manager_info = self.get_manager_version(hostname, username, password)
        if manager_info:
            # Get cluster status
            cluster_info = self.get_cluster_info(hostname, username, password)
            
            # Get individual cluster nodes
            cluster_nodes = self.get_cluster_nodes(hostname, username, password)
            
            print(f"  Found {len(cluster_nodes)} valid cluster node(s)")
            
            if cluster_nodes:
                # Add each cluster node as a separate entry
                for node in cluster_nodes:
                    node_name = f"{manager_name} - {node['fqdn']}"
                    results.append({
                        'name': node_name,
                        'version': node['version'],
                        'metadata': {
                            'type': 'nsx-manager',
                            'build': manager_info['build'],
                            'full_name': f"NSX-T {node['version']}",
                            'hostname': hostname,
                            'fqdn': node['fqdn'],
                            'ip_address': node['ip_address'],
                            'role': node['role'],
                            'environment': environment,
                            'cluster_name': manager_name,
                            'cluster_status': cluster_info['cluster_status'],
                            'mgmt_cluster_status': cluster_info['mgmt_cluster_status']
                        }
                    })
            else:
                # Fallback to single entry if cluster nodes API fails
                results.append({
                    'name': manager_name,
                    'version': manager_info['version'],
                    'metadata': {
                        'type': 'nsx-manager',
                        'build': manager_info['build'],
                        'full_name': manager_info['full_name'],
                        'hostname': hostname,
                        'environment': environment,
                        'cluster_status': cluster_info['cluster_status'],
                        'mgmt_cluster_status': cluster_info['mgmt_cluster_status']
                    }
                })
            
            # Get Edge Node versions
            edge_nodes = self.get_edge_nodes(hostname, username, password)
            for edge in edge_nodes:
                results.append({
                    'name': edge['name'],
                    'version': edge['version'],
                    'metadata': {
                        'type': 'edge-node',
                        'edge_id': edge['id'],
                        'state': edge['state'],
                        'deployment_type': edge['deployment_type'],
                        'form_factor': edge['form_factor'],
                        'manager': manager_name,
                        'environment': environment
                    }
                })
            
            # Get Host Transport Nodes (ESXi hosts in NSX fabric)
            host_nodes = self.get_host_transport_nodes(hostname, username, password)
            for host in host_nodes:
                results.append({
                    'name': host['name'],
                    'version': host.get('os_version', 'Unknown'),
                    'metadata': {
                        'type': 'host-transport-node',
                        'host_id': host['id'],
                        'state': host.get('state', 'unknown'),  # *** ADDED THIS ***
                        'os_type': host.get('os_type', 'Unknown'),
                        'maintenance_mode': host.get('maintenance_mode', 'DISABLED'),
                        'resource_type': host.get('resource_type', 'Unknown'),
                        'discovered_node_id': host.get('discovered_node_id', 'Unknown'),
                        'manager': manager_name,
                        'environment': environment
                    }
                })
            
            manager_node_count = len([r for r in results if r['metadata']['type'] == 'nsx-manager'])
            print(f"Collected data for {manager_name}: {manager_node_count} manager node(s) + {len(edge_nodes)} edge nodes + {len(host_nodes)} host transport nodes")
        else:
            print(f"Failed to collect data from {manager_name}")
        
        return results
    
    def collect_all(self):
        """Collect data from all configured NSX Managers"""
        all_results = []
        
        if not self.managers:
            print("No NSX Manager configurations loaded")
            return all_results
        
        for manager_config in self.managers:
            try:
                results = self.collect_from_manager(manager_config)
                all_results.extend(results)
            except Exception as e:
                print(f"Error collecting from {manager_config.get('manager_name', 'Unknown')}: {str(e)}")
                continue
        
        return all_results

# For testing purposes
if __name__ == '__main__':
    collector = NSXCollector()
    results = collector.collect_all()
    
    print(f"\nCollected {len(results)} total components:")
    for result in results:
        print(f"  {result['name']}: {result['version']}")
        print(f"    Type: {result['metadata']['type']}")
        if result['metadata']['type'] == 'nsx-manager':
            print(f"    Build: {result['metadata']['build']}")
            print(f"    Cluster Status: {result['metadata']['cluster_status']}")
        elif result['metadata']['type'] == 'edge-node':
            print(f"    State: {result['metadata']['state']}")
            print(f"    Form Factor: {result['metadata']['form_factor']}")
        elif result['metadata']['type'] == 'host-transport-node':
            print(f"    State: {result['metadata']['state']}")  # *** NOW PRINTS STATE ***
            print(f"    Maintenance Mode: {result['metadata']['maintenance_mode']}")
