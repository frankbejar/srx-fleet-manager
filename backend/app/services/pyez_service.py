"""
PyEZ Service
Juniper SRX device connection and operations using PyEZ
"""

import structlog
from typing import Optional, Dict
from jnpr.junos import Device as JunosDevice
from jnpr.junos.exception import ConnectError, RpcError
from contextlib import contextmanager

from app.settings import get_settings
from app.models import Device

logger = structlog.get_logger()
settings = get_settings()


class PyEZService:
    """Service for PyEZ device operations"""

    @staticmethod
    @contextmanager
    def connect(device: Device, timeout: int = None):
        """
        Context manager for PyEZ device connection

        Args:
            device: Device model instance
            timeout: Connection timeout (uses default if None)

        Yields:
            JunosDevice: Connected PyEZ device

        Raises:
            ConnectError: If connection fails
        """
        timeout = timeout or settings.srx_connect_timeout

        # Use device-specific credentials or defaults
        user = device.ssh_user or settings.srx_default_user
        password = device.ssh_password or settings.srx_default_password
        port = device.ssh_port or settings.srx_default_port

        logger.info(
            "Connecting to device",
            hostname=device.hostname,
            ip=device.mgmt_ip,
            port=port
        )

        dev = None
        try:
            dev = JunosDevice(
                host=device.mgmt_ip,
                user=user,
                password=password,
                port=port,
                gather_facts=False,
                timeout=timeout
            )

            dev.open()
            logger.info("Connected to device", hostname=device.hostname)

            yield dev

        except ConnectError as e:
            logger.error(
                "Failed to connect to device",
                hostname=device.hostname,
                error=str(e)
            )
            raise

        finally:
            if dev:
                try:
                    dev.close()
                    logger.info("Disconnected from device", hostname=device.hostname)
                except Exception as e:
                    logger.warning("Error closing connection", error=str(e))

    @staticmethod
    def get_facts(device: Device) -> Dict:
        """
        Get device facts

        Args:
            device: Device model instance

        Returns:
            Dict of device facts
        """
        with PyEZService.connect(device) as dev:
            # Gather facts
            facts = dev.facts

            return {
                'hostname': facts.get('hostname'),
                'model': facts.get('model'),
                'version': facts.get('version'),
                'serial_number': facts.get('serialnumber'),
                'uptime': facts.get('RE0', {}).get('up_time'),
                'personality': facts.get('personality')
            }

    @staticmethod
    def get_config(device: Device, format: str = 'set') -> str:
        """
        Get device configuration

        Args:
            device: Device model instance
            format: Config format ('set', 'text', 'xml', 'json')

        Returns:
            Configuration as string
        """
        with PyEZService.connect(device) as dev:
            logger.info("Fetching configuration", hostname=device.hostname, format=format)

            if format == 'set':
                # Get config as set commands
                config = dev.rpc.get_config(options={'format': 'set'})
                # Convert XML to string
                from lxml import etree
                config_text = etree.tostring(config, encoding='unicode', pretty_print=False)

                # Extract just the set commands
                lines = config_text.split('\n')
                set_commands = [line.strip() for line in lines if line.strip().startswith('set ')]
                return '\n'.join(set_commands)

            elif format == 'text':
                config = dev.rpc.get_config(options={'format': 'text'})
                from lxml import etree
                return etree.tostring(config, encoding='unicode')

            else:
                raise ValueError(f"Unsupported format: {format}")

    @staticmethod
    def get_system_storage(device: Device) -> Dict:
        """Get system storage information"""
        with PyEZService.connect(device) as dev:
            storage_rpc = dev.rpc.get_system_storage()

            # Parse storage info
            from lxml import etree
            storage_info = {}

            for filesystem in storage_rpc.findall('.//filesystem'):
                name = filesystem.findtext('filesystem-name', '')
                if '/dev/' in name:
                    size = filesystem.findtext('total-blocks', '0')
                    used = filesystem.findtext('used-blocks', '0')
                    avail = filesystem.findtext('available-blocks', '0')
                    percent = filesystem.findtext('used-percent', '0')

                    storage_info[name] = {
                        'size': size,
                        'used': used,
                        'available': avail,
                        'used_percent': int(percent.replace('%', ''))
                    }

            return storage_info

    @staticmethod
    def get_ipsec_sa(device: Device) -> list:
        """Get IPsec security associations (tunnels)"""
        with PyEZService.connect(device) as dev:
            sa_rpc = dev.rpc.get_security_ipsec_security_associations()

            tunnels = []
            from lxml import etree

            for sa in sa_rpc.findall('.//ipsec-security-associations'):
                tunnel = {
                    'remote_address': sa.findtext('ipsec-security-associations-remote-address', ''),
                    'port': sa.findtext('ipsec-security-associations-port', ''),
                    'index': sa.findtext('ipsec-security-associations-index', ''),
                    'spi': sa.findtext('ipsec-security-associations-spi', ''),
                    'state': sa.findtext('ipsec-security-associations-state', '')
                }
                tunnels.append(tunnel)

            return tunnels

    @staticmethod
    def commit_check(device: Device, config_changes: str) -> tuple[bool, str]:
        """
        Load configuration and perform commit check

        Args:
            device: Device model instance
            config_changes: Configuration changes (set commands)

        Returns:
            Tuple of (success: bool, message: str)
        """
        with PyEZService.connect(device) as dev:
            try:
                # Load configuration
                dev.cu.load(config_changes, format='set', merge=True)

                # Perform commit check
                dev.cu.commit_check()

                # Get diff
                diff = dev.cu.diff()

                # Rollback (don't commit yet)
                dev.cu.rollback()

                return True, diff

            except Exception as e:
                # Rollback on error
                try:
                    dev.cu.rollback()
                except:
                    pass

                return False, str(e)

    @staticmethod
    def commit_confirmed(device: Device, config_changes: str, timeout: int = 5) -> tuple[bool, str]:
        """
        Apply configuration with commit confirmed

        Args:
            device: Device model instance
            config_changes: Configuration changes
            timeout: Auto-rollback timeout in minutes

        Returns:
            Tuple of (success: bool, message: str)
        """
        with PyEZService.connect(device) as dev:
            try:
                # Load configuration
                dev.cu.load(config_changes, format='set', merge=True)

                # Commit check
                dev.cu.commit_check()

                # Get diff
                diff = dev.cu.diff()

                # Commit confirmed
                dev.cu.commit(comment="Applied via SRX Fleet Manager", confirm=timeout)

                logger.info(
                    "Configuration committed (confirmed)",
                    hostname=device.hostname,
                    timeout=timeout
                )

                return True, f"Configuration applied with {timeout} minute rollback timer"

            except Exception as e:
                logger.error("Commit failed", hostname=device.hostname, error=str(e))

                # Rollback
                try:
                    dev.cu.rollback()
                except:
                    pass

                return False, str(e)

    @staticmethod
    def commit_final(device: Device) -> tuple[bool, str]:
        """Finalize a commit-confirmed operation"""
        with PyEZService.connect(device) as dev:
            try:
                dev.cu.commit()
                logger.info("Commit finalized", hostname=device.hostname)
                return True, "Configuration committed successfully"

            except Exception as e:
                logger.error("Final commit failed", hostname=device.hostname, error=str(e))
                return False, str(e)
