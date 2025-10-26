"""
Application Settings
Loads configuration from environment variables
"""

from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration"""

    # App Info
    app_name: str = "SRX Fleet Manager"
    app_version: str = "1.0.0-alpha"
    debug: bool = True
    log_level: str = "INFO"

    # Database
    database_url: str

    # Redis
    redis_url: str

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Storage
    artifact_root: str = "/app/storage"
    config_repo_path: str = "/app/storage/configs"

    # SRX Defaults
    srx_default_user: str = "admin"
    srx_default_password: str = ""
    srx_default_port: int = 22
    srx_default_timeout: int = 30
    srx_max_concurrent: int = 5
    srx_connect_timeout: int = 10
    srx_command_timeout: int = 30

    # Authentication
    auth_mode: str = "LOCAL"  # LOCAL or OIDC
    local_auth_secret_key: str = "change-this-secret-key"
    local_auth_algorithm: str = "HS256"
    local_auth_access_token_expire_minutes: int = 60

    # OIDC (optional)
    oidc_authority: Optional[str] = None
    oidc_client_id: Optional[str] = None
    oidc_client_secret: Optional[str] = None

    # SharePoint (optional)
    sharepoint_enabled: bool = False
    sp_tenant_id: Optional[str] = None
    sp_client_id: Optional[str] = None
    sp_client_secret: Optional[str] = None
    sp_site_id: Optional[str] = None
    sp_drive_id: Optional[str] = None
    sp_folder_path: str = "ChangeRequests"

    # Celery
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/0"
    celery_timezone: str = "America/Phoenix"

    # Scheduled tasks
    backup_schedule_enabled: bool = True
    backup_schedule_cron: str = "0 2 * * *"
    health_check_interval: int = 300

    # Safety & Guardrails
    maintenance_windows_enabled: bool = True
    commit_confirmed_timeout: int = 5
    max_concurrent_operations: int = 5
    require_approval_policy_changes: bool = True
    require_approval_routing_changes: bool = True
    require_approval_upgrades: bool = True

    # JSNAPy
    jsnapy_tests_dir: str = "/app/jsnapy_tests"
    jsnapy_snapshots_dir: str = "/app/storage/jsnapy_snapshots"

    # Git
    git_author_name: str = "SRX Fleet Manager"
    git_author_email: str = "srx-manager@yourdomain.com"
    git_auto_commit: bool = True
    git_auto_push: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
