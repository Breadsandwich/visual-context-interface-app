import json
import pytest
from pathlib import Path

from agents.registry import AgentRegistry


class TestLoadAllConfigs:
    """Registry loads all .json configs and merges system prompts."""

    def test_load_all_configs(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        config = {
            "id": "test-agent",
            "name": "Test Agent",
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": "prompts/test-agent.md",
            "tools": ["read_file"],
            "max_tokens": 4096,
        }
        (configs_dir / "test-agent.json").write_text(json.dumps(config))
        (prompts_dir / "test-agent.md").write_text("You are a test agent.")

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)
        agents = registry.agents

        assert "test-agent" in agents
        assert agents["test-agent"]["name"] == "Test Agent"
        assert agents["test-agent"]["system_prompt"] == "You are a test agent."

    def test_loads_multiple_configs(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        for agent_id in ("alpha", "beta"):
            config = {
                "id": agent_id,
                "name": f"Agent {agent_id}",
                "model": "claude-sonnet-4-5-20250929",
                "system_prompt_file": f"prompts/{agent_id}.md",
                "tools": [],
                "max_tokens": 2048,
            }
            (configs_dir / f"{agent_id}.json").write_text(json.dumps(config))
            (prompts_dir / f"{agent_id}.md").write_text(f"Prompt for {agent_id}.")

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)

        assert len(registry.agents) == 2
        assert "alpha" in registry.agents
        assert "beta" in registry.agents
        assert registry.agents["alpha"]["system_prompt"] == "Prompt for alpha."
        assert registry.agents["beta"]["system_prompt"] == "Prompt for beta."

    def test_agents_property_returns_copy(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        config = {
            "id": "immutable-test",
            "name": "Immutable Agent",
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": "prompts/immutable-test.md",
            "tools": [],
            "max_tokens": 1024,
        }
        (configs_dir / "immutable-test.json").write_text(json.dumps(config))
        (prompts_dir / "immutable-test.md").write_text("Do not mutate me.")

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)

        copy_a = registry.agents
        copy_b = registry.agents
        assert copy_a is not copy_b
        assert copy_a == copy_b

        # Mutating the returned copy must not affect registry internals
        copy_a["immutable-test"]["name"] = "MUTATED"
        assert registry.agents["immutable-test"]["name"] == "Immutable Agent"


class TestGetAgent:
    """registry.get() returns a config copy or raises KeyError."""

    def test_get_returns_agent_config(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        config = {
            "id": "fetcher",
            "name": "Fetcher",
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": "prompts/fetcher.md",
            "tools": ["search_files"],
            "max_tokens": 4096,
        }
        (configs_dir / "fetcher.json").write_text(json.dumps(config))
        (prompts_dir / "fetcher.md").write_text("You fetch things.")

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)
        agent = registry.get("fetcher")

        assert agent["id"] == "fetcher"
        assert agent["name"] == "Fetcher"
        assert agent["system_prompt"] == "You fetch things."

    def test_get_returns_copy(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        config = {
            "id": "copycheck",
            "name": "CopyCheck",
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": "prompts/copycheck.md",
            "tools": [],
            "max_tokens": 1024,
        }
        (configs_dir / "copycheck.json").write_text(json.dumps(config))
        (prompts_dir / "copycheck.md").write_text("Original prompt.")

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)

        copy_a = registry.get("copycheck")
        copy_b = registry.get("copycheck")
        assert copy_a is not copy_b
        assert copy_a == copy_b

        copy_a["name"] = "MUTATED"
        assert registry.get("copycheck")["name"] == "CopyCheck"

    def test_get_unknown_agent(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)

        with pytest.raises(KeyError, match="nonexistent"):
            registry.get("nonexistent")


class TestGracefulErrorHandling:
    """Registry handles missing prompts and malformed JSON gracefully."""

    def test_config_missing_prompt_file(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        config = {
            "id": "no-prompt",
            "name": "No Prompt Agent",
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": "prompts/missing.md",
            "tools": [],
            "max_tokens": 1024,
        }
        (configs_dir / "no-prompt.json").write_text(json.dumps(config))
        # Deliberately do NOT create prompts/missing.md

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)
        agent = registry.get("no-prompt")

        assert agent["system_prompt"] == ""
        assert agent["name"] == "No Prompt Agent"

    def test_malformed_json_skipped(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        # Valid config
        valid = {
            "id": "valid-agent",
            "name": "Valid Agent",
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": "prompts/valid-agent.md",
            "tools": [],
            "max_tokens": 1024,
        }
        (configs_dir / "valid-agent.json").write_text(json.dumps(valid))
        (prompts_dir / "valid-agent.md").write_text("I am valid.")

        # Malformed config
        (configs_dir / "broken.json").write_text("{invalid json!!!")

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)

        assert "valid-agent" in registry.agents
        assert "broken" not in registry.agents
        assert len(registry.agents) == 1

    def test_config_without_system_prompt_file_key(self, tmp_path: Path):
        configs_dir = tmp_path / "configs"
        prompts_dir = tmp_path / "prompts"
        configs_dir.mkdir()
        prompts_dir.mkdir()

        config = {
            "id": "no-prompt-key",
            "name": "No Prompt Key Agent",
            "model": "claude-sonnet-4-5-20250929",
            "tools": [],
            "max_tokens": 1024,
        }
        (configs_dir / "no-prompt-key.json").write_text(json.dumps(config))

        registry = AgentRegistry(configs_dir=configs_dir, prompts_dir=prompts_dir)
        agent = registry.get("no-prompt-key")

        assert agent["system_prompt"] == ""
