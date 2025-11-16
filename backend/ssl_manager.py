#!/usr/bin/env python3
"""
SSL Certificate Manager for Databank Cloud Version Tracker
Generates self-signed certificates and manages SSL configuration
"""

from cryptography import x509
from cryptography.x509.oid import NameOID, ExtensionOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
from datetime import datetime, timedelta
import os
import sqlite3
import json

SSL_DIR = 'ssl'
CERT_FILE = os.path.join(SSL_DIR, 'cert.pem')
KEY_FILE = os.path.join(SSL_DIR, 'key.pem')
DB_PATH = 'version_data.db'

def init_ssl_table():
    """Initialize SSL configuration table in database"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS ssl_config
                 (id INTEGER PRIMARY KEY CHECK (id = 1),
                  cert_path TEXT NOT NULL,
                  key_path TEXT NOT NULL,
                  cert_info TEXT,
                  is_self_signed INTEGER DEFAULT 1,
                  created_at TIMESTAMP NOT NULL,
                  expires_at TIMESTAMP,
                  uploaded_at TIMESTAMP)''')
    
    conn.commit()
    conn.close()
    print("SSL configuration table initialized")

def generate_self_signed_cert(
    common_name='localhost',
    organization='Databank',
    organizational_unit='Cloud Operations',
    country='US',
    state='State',
    locality='City',
    validity_days=365
):
    """Generate a self-signed SSL certificate"""
    
    # Ensure SSL directory exists
    os.makedirs(SSL_DIR, exist_ok=True)
    
    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    
    # Build subject name
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, country),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, state),
        x509.NameAttribute(NameOID.LOCALITY_NAME, locality),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, organizational_unit),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])
    
    # Build certificate
    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        private_key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.utcnow()
    ).not_valid_after(
        datetime.utcnow() + timedelta(days=validity_days)
    ).add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName(common_name),
            x509.DNSName('localhost'),
            x509.DNSName('127.0.0.1'),
        ]),
        critical=False,
    ).add_extension(
        x509.BasicConstraints(ca=False, path_length=None),
        critical=True,
    ).add_extension(
        x509.KeyUsage(
            digital_signature=True,
            content_commitment=False,
            key_encipherment=True,
            data_encipherment=False,
            key_agreement=False,
            key_cert_sign=False,
            crl_sign=False,
            encipher_only=False,
            decipher_only=False,
        ),
        critical=True,
    ).sign(private_key, hashes.SHA256(), default_backend())
    
    # Write private key to file
    with open(KEY_FILE, 'wb') as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))
    
    # Write certificate to file
    with open(CERT_FILE, 'wb') as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    
    # Set proper permissions
    os.chmod(KEY_FILE, 0o600)
    os.chmod(CERT_FILE, 0o644)
    
    # Store certificate info in database
    cert_info = {
        'common_name': common_name,
        'organization': organization,
        'organizational_unit': organizational_unit,
        'country': country,
        'state': state,
        'locality': locality,
        'validity_days': validity_days,
        'not_before': datetime.utcnow().isoformat(),
        'not_after': (datetime.utcnow() + timedelta(days=validity_days)).isoformat(),
        'serial_number': str(cert.serial_number)
    }
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Delete existing config (only one row allowed)
    c.execute('DELETE FROM ssl_config')
    
    c.execute('''INSERT INTO ssl_config 
                 (id, cert_path, key_path, cert_info, is_self_signed, created_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)''',
              (1, CERT_FILE, KEY_FILE, json.dumps(cert_info), 1,
               datetime.now().isoformat(),
               (datetime.utcnow() + timedelta(days=validity_days)).isoformat()))
    
    conn.commit()
    conn.close()
    
    print(f"Self-signed certificate generated successfully!")
    print(f"Certificate: {CERT_FILE}")
    print(f"Private Key: {KEY_FILE}")
    print(f"Common Name: {common_name}")
    print(f"Valid for: {validity_days} days")
    print(f"Expires: {(datetime.utcnow() + timedelta(days=validity_days)).strftime('%Y-%m-%d %H:%M:%S')} UTC")
    
    return CERT_FILE, KEY_FILE

def get_certificate_info(cert_path):
    """Extract information from a certificate file"""
    try:
        with open(cert_path, 'rb') as f:
            cert_data = f.read()
        
        cert = x509.load_pem_x509_certificate(cert_data, default_backend())
        
        # Extract subject information
        subject = cert.subject
        
        def get_attribute(subject, oid):
            try:
                return subject.get_attributes_for_oid(oid)[0].value
            except (IndexError, AttributeError):
                return 'N/A'
        
        info = {
            'common_name': get_attribute(subject, NameOID.COMMON_NAME),
            'organization': get_attribute(subject, NameOID.ORGANIZATION_NAME),
            'organizational_unit': get_attribute(subject, NameOID.ORGANIZATIONAL_UNIT_NAME),
            'country': get_attribute(subject, NameOID.COUNTRY_NAME),
            'state': get_attribute(subject, NameOID.STATE_OR_PROVINCE_NAME),
            'locality': get_attribute(subject, NameOID.LOCALITY_NAME),
            'not_before': cert.not_valid_before.isoformat(),
            'not_after': cert.not_valid_after.isoformat(),
            'serial_number': str(cert.serial_number),
            'issuer': cert.issuer.rfc4514_string()
        }
        
        # Check if self-signed
        info['is_self_signed'] = cert.issuer == cert.subject
        
        return info
    
    except Exception as e:
        print(f"Error reading certificate: {e}")
        return None

def validate_certificate_pair(cert_path, key_path):
    """Validate that certificate and key pair match"""
    try:
        # Load certificate
        with open(cert_path, 'rb') as f:
            cert_data = f.read()
        cert = x509.load_pem_x509_certificate(cert_data, default_backend())
        
        # Load private key
        with open(key_path, 'rb') as f:
            key_data = f.read()
        
        # Try different key formats
        try:
            private_key = serialization.load_pem_private_key(
                key_data, password=None, backend=default_backend()
            )
        except:
            return False, "Invalid private key format"
        
        # Compare public key from cert with public key from private key
        cert_public_key = cert.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        private_public_key = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        if cert_public_key == private_public_key:
            return True, "Certificate and key pair are valid"
        else:
            return False, "Certificate and key do not match"
    
    except Exception as e:
        return False, f"Validation error: {str(e)}"

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == 'init':
        # Just initialize the database table
        init_ssl_table()
    else:
        # Generate self-signed certificate
        print("Generating self-signed SSL certificate...")
        init_ssl_table()
        
        # Get hostname if provided, otherwise use localhost
        hostname = sys.argv[1] if len(sys.argv) > 1 else 'localhost'
        generate_self_signed_cert(common_name=hostname)
