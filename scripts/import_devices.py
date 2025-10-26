#!/usr/bin/env python3
"""
Import Devices from Old SRX Manager CSV
Migrates inventory from juniper-srx-manager/config/srx_inventory.csv
"""

import sys
import csv
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import Device


def read_old_csv(csv_path: Path) -> list[dict]:
    """Read devices from old SRX manager CSV"""
    devices = []

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            devices.append({
                'hostname': row.get('Site Name', '').strip(),
                'mgmt_ip': row.get('Public IP', '').strip(),
                'subnet': row.get('Subnet', '').strip(),
                'city': row.get('City', '').strip(),
                'state': row.get('State', '').strip(),
                'region': row.get('Region', '').strip(),
                'entity': row.get('Entity', '').strip(),
                'it_technician': row.get('IT Technician', '').strip(),
                'isp_provider': row.get('ISP Provider', '').strip(),
                'wan_type': row.get('WAN Type', '').strip(),
                'account_number': row.get('Account Number', '').strip(),
                'site': row.get('City', '').strip(),  # Use city as site
            })

    return devices


def import_devices(db: Session, devices_data: list[dict]) -> dict:
    """Import devices into database"""
    stats = {
        'total': len(devices_data),
        'imported': 0,
        'updated': 0,
        'skipped': 0,
        'errors': []
    }

    for data in devices_data:
        try:
            # Skip if no IP
            if not data['mgmt_ip']:
                stats['skipped'] += 1
                continue

            # Check if device exists
            existing = db.query(Device).filter(Device.mgmt_ip == data['mgmt_ip']).first()

            if existing:
                # Update existing device
                for key, value in data.items():
                    if value:  # Only update non-empty values
                        setattr(existing, key, value)
                existing.updated_at = datetime.utcnow()
                stats['updated'] += 1
                print(f"✓ Updated: {existing.hostname} ({existing.mgmt_ip})")
            else:
                # Create new device
                device = Device(
                    **data,
                    enabled=True,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.add(device)
                stats['imported'] += 1
                print(f"✓ Imported: {device.hostname} ({device.mgmt_ip})")

            db.commit()

        except Exception as e:
            db.rollback()
            error_msg = f"Error with {data.get('hostname', 'Unknown')}: {str(e)}"
            stats['errors'].append(error_msg)
            print(f"✗ {error_msg}")

    return stats


def main():
    """Main import function"""
    print("=" * 70)
    print("SRX Fleet Manager - Device Import")
    print("=" * 70)
    print()

    # Find old CSV
    old_csv_path = Path(__file__).parent.parent.parent / 'juniper-srx-manager' / 'config' / 'srx_inventory.csv'

    if not old_csv_path.exists():
        print(f"✗ CSV file not found: {old_csv_path}")
        print()
        print("Please provide path to CSV file:")
        print("  python scripts/import_devices.py /path/to/srx_inventory.csv")
        sys.exit(1)

    # Allow command line override
    if len(sys.argv) > 1:
        old_csv_path = Path(sys.argv[1])

    print(f"Reading from: {old_csv_path}")
    print()

    # Read CSV
    try:
        devices_data = read_old_csv(old_csv_path)
        print(f"Found {len(devices_data)} devices in CSV")
        print()
    except Exception as e:
        print(f"✗ Error reading CSV: {e}")
        sys.exit(1)

    # Create tables if they don't exist
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables ready")
    print()

    # Import devices
    print("Importing devices...")
    print("-" * 70)
    db = SessionLocal()
    try:
        stats = import_devices(db, devices_data)
    finally:
        db.close()

    # Print summary
    print()
    print("=" * 70)
    print("IMPORT SUMMARY")
    print("=" * 70)
    print(f"Total devices in CSV: {stats['total']}")
    print(f"✓ Imported (new):     {stats['imported']}")
    print(f"✓ Updated (existing): {stats['updated']}")
    print(f"⊘ Skipped:            {stats['skipped']}")
    print(f"✗ Errors:             {len(stats['errors'])}")

    if stats['errors']:
        print()
        print("Errors:")
        for error in stats['errors']:
            print(f"  - {error}")

    print()
    print("=" * 70)

    # Query and display by region
    db = SessionLocal()
    try:
        from sqlalchemy import func

        print()
        print("DEVICES BY REGION:")
        print("-" * 70)

        results = db.query(
            Device.region,
            func.count(Device.id).label('count')
        ).filter(Device.enabled == True).group_by(Device.region).order_by(func.count(Device.id).desc()).all()

        for region, count in results:
            print(f"  {region or 'Unknown':20s}: {count:2d} devices")

        print()
        total = db.query(Device).filter(Device.enabled == True).count()
        print(f"Total active devices: {total}")
        print()

    finally:
        db.close()

    print("✅ Import complete!")
    print()
    print("Next steps:")
    print("  1. Start the application: docker-compose up -d")
    print("  2. View devices: http://localhost:8000/api/devices")
    print("  3. Access UI: http://localhost:3000")


if __name__ == '__main__':
    main()
