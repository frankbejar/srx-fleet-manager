"""
Git Service
Manages configuration versioning using Git
"""

import os
import structlog
from pathlib import Path
from datetime import datetime
import git

from app.settings import get_settings
from app.models import Device

logger = structlog.get_logger()
settings = get_settings()


class GitService:
    """Service for Git operations on config backups"""

    def __init__(self, repo_path: str = None):
        """
        Initialize Git service

        Args:
            repo_path: Path to git repository (uses settings default if None)
        """
        self.repo_path = Path(repo_path or settings.config_repo_path)
        self._ensure_repo()

    def _ensure_repo(self):
        """Ensure git repository exists and is initialized"""
        self.repo_path.mkdir(parents=True, exist_ok=True)

        if not (self.repo_path / '.git').exists():
            logger.info("Initializing git repository", path=str(self.repo_path))

            repo = git.Repo.init(self.repo_path)

            # Create initial commit
            gitignore_path = self.repo_path / '.gitignore'
            gitignore_path.write_text("*.tmp\n*.bak\n")

            repo.index.add(['.gitignore'])
            repo.index.commit(
                "Initial commit: SRX config repository",
                author=git.Actor(settings.git_author_name, settings.git_author_email)
            )

            logger.info("Git repository initialized")

    def get_repo(self) -> git.Repo:
        """Get git repository instance"""
        return git.Repo(self.repo_path)

    def save_config(self, device: Device, config_text: str, message: str = None) -> tuple[str, str]:
        """
        Save device configuration to git repository

        Args:
            device: Device model instance
            config_text: Configuration text
            message: Commit message (auto-generated if None)

        Returns:
            Tuple of (file_path: str, commit_sha: str)
        """
        # Create directory structure: region/site/hostname.conf
        device_dir = self.repo_path / (device.region or 'unknown') / (device.site or 'unknown')
        device_dir.mkdir(parents=True, exist_ok=True)

        # File path
        config_file = device_dir / f"{device.hostname}.conf"

        # Write config
        config_file.write_text(config_text)
        logger.info(
            "Saved config to file",
            hostname=device.hostname,
            path=str(config_file.relative_to(self.repo_path))
        )

        # Git operations
        if settings.git_auto_commit:
            commit_sha = self._commit_config(device, config_file, message)
        else:
            commit_sha = None

        return str(config_file.relative_to(self.repo_path)), commit_sha

    def _commit_config(self, device: Device, config_file: Path, message: str = None) -> str:
        """Commit configuration changes"""
        repo = self.get_repo()

        # Add file
        relative_path = str(config_file.relative_to(self.repo_path))
        repo.index.add([relative_path])

        # Generate commit message
        if not message:
            message = f"Backup: {device.hostname} ({device.mgmt_ip}) - {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}"

        # Commit
        commit = repo.index.commit(
            message,
            author=git.Actor(settings.git_author_name, settings.git_author_email)
        )

        logger.info(
            "Committed config",
            hostname=device.hostname,
            commit_sha=commit.hexsha[:8],
            message=message
        )

        return commit.hexsha

    def get_config_history(self, device: Device, limit: int = 10) -> list:
        """
        Get commit history for a device's config

        Args:
            device: Device model instance
            limit: Maximum number of commits to return

        Returns:
            List of commit dicts
        """
        repo = self.get_repo()

        # File path pattern
        file_pattern = f"*/*/{device.hostname}.conf"

        try:
            commits = list(repo.iter_commits(paths=file_pattern, max_count=limit))

            history = []
            for commit in commits:
                history.append({
                    'sha': commit.hexsha,
                    'short_sha': commit.hexsha[:8],
                    'message': commit.message.strip(),
                    'author': str(commit.author),
                    'authored_date': datetime.fromtimestamp(commit.authored_date),
                    'committed_date': datetime.fromtimestamp(commit.committed_date)
                })

            return history

        except Exception as e:
            logger.warning("Error getting config history", hostname=device.hostname, error=str(e))
            return []

    def get_config_at_commit(self, device: Device, commit_sha: str) -> str:
        """
        Get device configuration at a specific commit

        Args:
            device: Device model instance
            commit_sha: Git commit SHA

        Returns:
            Configuration text
        """
        repo = self.get_repo()

        # Find config file
        file_pattern = f"*/*/{device.hostname}.conf"

        try:
            commit = repo.commit(commit_sha)

            # Find file in commit
            for item in commit.tree.traverse():
                if item.type == 'blob' and item.path.endswith(f"{device.hostname}.conf"):
                    return item.data_stream.read().decode('utf-8')

            raise FileNotFoundError(f"Config not found for {device.hostname} at commit {commit_sha}")

        except Exception as e:
            logger.error("Error fetching config at commit", hostname=device.hostname, commit=commit_sha, error=str(e))
            raise

    def get_diff(self, device: Device, old_sha: str = None, new_sha: str = 'HEAD') -> str:
        """
        Get diff between two commits

        Args:
            device: Device model instance
            old_sha: Old commit SHA (uses HEAD~1 if None)
            new_sha: New commit SHA (defaults to HEAD)

        Returns:
            Diff text
        """
        repo = self.get_repo()

        file_pattern = f"*/*/{device.hostname}.conf"

        try:
            if old_sha is None:
                # Compare HEAD with previous commit
                diff = repo.git.diff('HEAD~1', 'HEAD', '--', file_pattern)
            else:
                diff = repo.git.diff(old_sha, new_sha, '--', file_pattern)

            return diff

        except Exception as e:
            logger.warning("Error getting diff", hostname=device.hostname, error=str(e))
            return ""

    def get_stats(self) -> dict:
        """Get repository statistics"""
        repo = self.get_repo()

        try:
            total_commits = len(list(repo.iter_commits()))
            total_files = len(list(repo.tree().traverse()))

            # Count config files
            config_files = [item for item in repo.tree().traverse() if item.type == 'blob' and item.path.endswith('.conf')]

            return {
                'total_commits': total_commits,
                'total_files': total_files,
                'config_files': len(config_files),
                'repo_size_mb': self._get_repo_size()
            }

        except Exception as e:
            logger.error("Error getting repo stats", error=str(e))
            return {}

    def _get_repo_size(self) -> float:
        """Get repository size in MB"""
        total_size = 0
        for dirpath, dirnames, filenames in os.walk(self.repo_path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                if os.path.isfile(filepath):
                    total_size += os.path.getsize(filepath)

        return round(total_size / (1024 * 1024), 2)
