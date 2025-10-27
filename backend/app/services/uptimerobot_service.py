"""
Uptime Robot Service
Integrates with Uptime Robot API for device monitoring status
"""

import httpx
import structlog
from typing import Optional, List, Dict, Any
from app.settings import get_settings

logger = structlog.get_logger()


class UptimeRobotService:
    """Service to interact with Uptime Robot API"""

    BASE_URL = "https://api.uptimerobot.com/v2"

    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.uptimerobot_api_key
        self.enabled = self.settings.uptimerobot_enabled and self.api_key is not None

    async def get_monitors(self, search: Optional[str] = None) -> Dict[str, Any]:
        """
        Get all monitors from Uptime Robot

        Args:
            search: Optional search term to filter monitors

        Returns:
            Dict with monitors list and pagination info
        """
        if not self.enabled:
            logger.warning("Uptime Robot integration is disabled")
            return {"stat": "fail", "error": "Uptime Robot integration is disabled"}

        try:
            payload = {
                "api_key": self.api_key,
                "format": "json",
                "logs": "0",
                "response_times": "1",
                "response_times_limit": "1",
                "custom_uptime_ratios": "1-7-30",
            }

            if search:
                payload["search"] = search

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/getMonitors",
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

                if data.get("stat") == "ok":
                    logger.info(
                        "Retrieved Uptime Robot monitors",
                        total=data.get("pagination", {}).get("total", 0),
                    )
                    return data
                else:
                    logger.error("Uptime Robot API error", error=data.get("error"))
                    return data

        except httpx.HTTPError as e:
            logger.error("Failed to fetch Uptime Robot monitors", error=str(e))
            return {"stat": "fail", "error": str(e)}

    async def get_monitor_by_ip(self, ip_address: str) -> Optional[Dict[str, Any]]:
        """
        Find a monitor by IP address

        Args:
            ip_address: IP address to search for

        Returns:
            Monitor data or None if not found
        """
        data = await self.get_monitors(search=ip_address)

        if data.get("stat") == "ok":
            monitors = data.get("monitors", [])
            for monitor in monitors:
                if monitor.get("url") == ip_address:
                    return monitor
        return None

    def get_status_text(self, status_code: int) -> str:
        """
        Convert status code to human-readable text

        Args:
            status_code: Uptime Robot status code

        Returns:
            Status text
        """
        status_map = {
            0: "Paused",
            1: "Not Checked",
            2: "Up",
            8: "Seems Down",
            9: "Down",
        }
        return status_map.get(status_code, "Unknown")

    def get_status_color(self, status_code: int) -> str:
        """
        Get color code for status

        Args:
            status_code: Uptime Robot status code

        Returns:
            Color name (green, yellow, red, gray)
        """
        color_map = {
            0: "gray",    # Paused
            1: "gray",    # Not Checked
            2: "green",   # Up
            8: "yellow",  # Seems Down
            9: "red",     # Down
        }
        return color_map.get(status_code, "gray")

    async def enrich_device_with_uptime(
        self, device_ip: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get uptime monitoring data for a device

        Args:
            device_ip: Device IP address

        Returns:
            Enriched uptime data or None
        """
        monitor = await self.get_monitor_by_ip(device_ip)

        if not monitor:
            return None

        # Extract uptime ratios (1 day, 7 days, 30 days)
        uptime_ratios = {}
        custom_uptime_ratio = monitor.get("custom_uptime_ratio", "")
        if custom_uptime_ratio:
            ratios = custom_uptime_ratio.split("-")
            if len(ratios) >= 3:
                uptime_ratios = {
                    "1_day": float(ratios[0]) if ratios[0] else None,
                    "7_day": float(ratios[1]) if ratios[1] else None,
                    "30_day": float(ratios[2]) if ratios[2] else None,
                }

        # Get latest response time
        response_time = None
        response_times = monitor.get("response_times", [])
        if response_times and len(response_times) > 0:
            response_time = response_times[0].get("value")

        return {
            "monitor_id": monitor.get("id"),
            "friendly_name": monitor.get("friendly_name"),
            "status": monitor.get("status"),
            "status_text": self.get_status_text(monitor.get("status", 0)),
            "status_color": self.get_status_color(monitor.get("status", 0)),
            "uptime_ratios": uptime_ratios,
            "response_time_ms": response_time,
            "monitor_type": monitor.get("type"),
            "port": monitor.get("port"),
        }
