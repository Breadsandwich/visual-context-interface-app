"""Agent registry — loads agent configs and merges system prompts."""

import copy
import json
import logging
from pathlib import Path
from typing import Dict

logger = logging.getLogger(__name__)


class AgentRegistry:
    """Loads agent JSON configs and resolves their system prompt files.

    Parameters
    ----------
    configs_dir : Path
        Directory containing ``*.json`` agent config files.
    prompts_dir : Path
        Directory containing prompt ``.md`` files referenced by configs.
    """

    def __init__(self, configs_dir: Path, prompts_dir: Path) -> None:
        self._configs_dir = configs_dir
        self._prompts_dir = prompts_dir
        self._agents: Dict[str, dict] = {}
        self._load_all()

    # -- public API -----------------------------------------------------------

    @property
    def agents(self) -> Dict[str, dict]:
        """Return a deep copy of all loaded agent configs."""
        return copy.deepcopy(self._agents)

    def get(self, agent_id: str) -> dict:
        """Return a deep copy of a single agent config.

        Raises
        ------
        KeyError
            If *agent_id* is not found in the registry.
        """
        if agent_id not in self._agents:
            raise KeyError(agent_id)
        return copy.deepcopy(self._agents[agent_id])

    # -- private helpers ------------------------------------------------------

    def _load_all(self) -> None:
        """Scan *configs_dir* for JSON files and load each one."""
        for config_path in sorted(self._configs_dir.glob("*.json")):
            self._load_config(config_path)

    def _load_config(self, config_path: Path) -> None:
        """Parse a single JSON config and merge its system prompt."""
        try:
            raw = config_path.read_text(encoding="utf-8")
            config = json.loads(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.error(
                "Skipping malformed config %s: %s", config_path.name, exc
            )
            return

        agent_id = config.get("id", config_path.stem)
        config["system_prompt"] = self._resolve_prompt(config)
        self._agents[agent_id] = config

    def _resolve_prompt(self, config: dict) -> str:
        """Read the prompt file referenced by *system_prompt_file*, or return ''."""
        prompt_file_rel = config.get("system_prompt_file")
        if not prompt_file_rel:
            return ""

        # The prompt path in configs is relative to the *parent* of prompts_dir
        # (e.g. "prompts/orchestrator.md"), so resolve against parent.
        prompt_path = self._prompts_dir.parent / prompt_file_rel

        try:
            return prompt_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            logger.warning(
                "Prompt file not found for agent '%s': %s",
                config.get("id", "unknown"),
                prompt_path,
            )
            return ""
