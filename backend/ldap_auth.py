#!/usr/bin/env python3
"""
LDAP Authentication Module
Handles LDAP authentication and group-to-role mapping
"""

import sqlite3
from ldap3 import Server, Connection, ALL, SUBTREE
from ldap3.core.exceptions import LDAPException, LDAPBindError
import json

DB_PATH = 'vmware_versions.db'

class LDAPAuthenticator:
    def __init__(self):
        self.config = None
        self.group_mappings = {}
        self.load_config()
    
    def load_config(self):
        """Load LDAP configuration and group mappings from database"""
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            
            # Load LDAP config
            c.execute('SELECT * FROM ldap_config WHERE id = 1')
            row = c.fetchone()
            if row:
                self.config = {
                    'enabled': bool(row[1]),
                    'server': row[2],
                    'port': row[3],
                    'use_ssl': bool(row[4]),
                    'base_dn': row[5],
                    'bind_dn': row[6],
                    'bind_password': row[7],
                    'user_search_filter': row[8],
                    'user_search_base': row[9],
                    'group_search_base': row[10],
                    'group_membership_attribute': row[11]
                }
            
            # Load group mappings
            c.execute('SELECT ldap_group_dn, site_role FROM ldap_group_mappings')
            for row in c.fetchall():
                self.group_mappings[row[0]] = row[1]
            
            conn.close()
        except Exception as e:
            print(f"Error loading LDAP config: {e}")
            self.config = None
    
    def is_enabled(self):
        """Check if LDAP authentication is enabled"""
        return self.config is not None and self.config['enabled']
    
    def authenticate(self, username, password):
        """
        Authenticate user via LDAP and determine role from group membership
        Returns: (success: bool, role: str or None, error: str or None)
        """
        if not self.is_enabled():
            return False, None, "LDAP not configured or disabled"
        
        try:
            # Create server connection
            server = Server(
                self.config['server'],
                port=self.config['port'],
                use_ssl=self.config['use_ssl'],
                get_info=ALL
            )
            
            # First bind with service account to search for user
            bind_conn = Connection(
                server,
                user=self.config['bind_dn'],
                password=self.config['bind_password'],
                auto_bind=True
            )
            
            # Search for user
            search_filter = self.config['user_search_filter'].replace('{username}', username)
            search_base = self.config['user_search_base'] or self.config['base_dn']
            
            bind_conn.search(
                search_base=search_base,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=['dn', 'memberOf', 'cn', 'mail']
            )
            
            if not bind_conn.entries:
                bind_conn.unbind()
                return False, None, "User not found in LDAP"
            
            user_entry = bind_conn.entries[0]
            user_dn = user_entry.entry_dn
            
            # Get user's group memberships
            member_of = []
            if hasattr(user_entry, 'memberOf'):
                if isinstance(user_entry.memberOf, list):
                    member_of = [str(group) for group in user_entry.memberOf]
                else:
                    member_of = [str(user_entry.memberOf)]
            
            bind_conn.unbind()
            
            # Try to authenticate as the user
            user_conn = Connection(
                server,
                user=user_dn,
                password=password
            )
            
            if not user_conn.bind():
                return False, None, "Invalid password"
            
            user_conn.unbind()
            
            # Map user's groups to site role
            role = self.determine_role(member_of)
            
            if not role:
                return False, None, "User not member of any mapped LDAP groups"
            
            return True, role, None
            
        except LDAPBindError as e:
            return False, None, f"LDAP bind error: {str(e)}"
        except LDAPException as e:
            return False, None, f"LDAP error: {str(e)}"
        except Exception as e:
            return False, None, f"Authentication error: {str(e)}"
    
    def determine_role(self, user_groups):
        """
        Determine site role based on user's LDAP group memberships
        Returns highest priority role if user is in multiple mapped groups
        Priority: Admin > Support > Read-only
        """
        role_priority = {'Admin': 3, 'Support': 2, 'Read-only': 1}
        highest_role = None
        highest_priority = 0
        
        for group_dn in user_groups:
            # Normalize group DN for comparison (case-insensitive)
            group_dn_lower = group_dn.lower()
            
            # Check if this group is mapped to a role
            for mapped_group, role in self.group_mappings.items():
                if mapped_group.lower() == group_dn_lower:
                    priority = role_priority.get(role, 0)
                    if priority > highest_priority:
                        highest_priority = priority
                        highest_role = role
        
        return highest_role
    
    def test_connection(self):
        """Test LDAP connection with current configuration"""
        if not self.config:
            return False, "No LDAP configuration found"
        
        try:
            server = Server(
                self.config['server'],
                port=self.config['port'],
                use_ssl=self.config['use_ssl'],
                get_info=ALL
            )
            
            conn = Connection(
                server,
                user=self.config['bind_dn'],
                password=self.config['bind_password']
            )
            
            if conn.bind():
                conn.unbind()
                return True, "Connection successful"
            else:
                return False, "Bind failed"
                
        except Exception as e:
            return False, f"Connection error: {str(e)}"
    
    def search_groups(self, search_pattern="*"):
        """
        Search for LDAP groups (for UI group selection)
        Returns list of group DNs matching pattern
        """
        if not self.is_enabled():
            return []
        
        try:
            server = Server(
                self.config['server'],
                port=self.config['port'],
                use_ssl=self.config['use_ssl'],
                get_info=ALL
            )
            
            conn = Connection(
                server,
                user=self.config['bind_dn'],
                password=self.config['bind_password'],
                auto_bind=True
            )
            
            search_base = self.config['group_search_base'] or self.config['base_dn']
            search_filter = f"(&(objectClass=group)(cn={search_pattern}))"
            
            conn.search(
                search_base=search_base,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=['dn', 'cn', 'description']
            )
            
            groups = []
            for entry in conn.entries:
                groups.append({
                    'dn': str(entry.entry_dn),
                    'cn': str(entry.cn) if hasattr(entry, 'cn') else '',
                    'description': str(entry.description) if hasattr(entry, 'description') else ''
                })
            
            conn.unbind()
            return groups
            
        except Exception as e:
            print(f"Error searching groups: {e}")
            return []
