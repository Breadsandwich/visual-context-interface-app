"""Tests for the proxy service."""

import os
from unittest.mock import patch, AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def external_client():
    """Create a test client with external target (host.docker.internal)."""
    with patch.dict(os.environ, {
        "TARGET_HOST": "host.docker.internal",
        "TARGET_PORT": "3000",
    }):
        # Re-import to pick up patched env vars
        import importlib
        import main
        importlib.reload(main)
        yield TestClient(main.app)
        # Restore defaults
        with patch.dict(os.environ, {
            "TARGET_HOST": "localhost",
            "TARGET_PORT": "3001",
        }, clear=False):
            importlib.reload(main)


@pytest.fixture()
def internal_client():
    """Create a test client with internal dummy-target."""
    with patch.dict(os.environ, {
        "TARGET_HOST": "dummy-target",
        "TARGET_PORT": "3001",
    }):
        import importlib
        import main
        importlib.reload(main)
        yield TestClient(main.app)


class TestHealthCheck:
    def test_health_returns_target_info(self, internal_client):
        response = internal_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["target"] == "dummy-target:3001"
        assert data["external"] is False

    def test_health_external_target(self, external_client):
        response = external_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["target"] == "host.docker.internal:3000"
        assert data["external"] is True


class TestExternalTargetRouting:
    """When TARGET_HOST is external (e.g. host.docker.internal),
    the proxy should strip the /proxy/ prefix."""

    @patch("main.httpx.AsyncClient")
    @pytest.mark.anyio()
    async def test_strips_proxy_prefix_for_external_target(self, mock_client_cls):
        """External target: /proxy/page → http://host.docker.internal:3000/page"""
        with patch.dict(os.environ, {
            "TARGET_HOST": "host.docker.internal",
            "TARGET_PORT": "3000",
        }):
            import importlib
            import main
            importlib.reload(main)

            assert main._is_external_target is True

            mock_response = AsyncMock()
            mock_response.headers = {"content-type": "text/plain"}
            mock_response.content = b"hello"
            mock_response.status_code = 200

            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_instance

            client = TestClient(main.app)
            response = client.get("/proxy/some/page")

            # Verify the proxy called the target WITHOUT /proxy/ prefix
            mock_instance.get.assert_called_once()
            called_url = mock_instance.get.call_args[0][0]
            assert called_url == "http://host.docker.internal:3000/some/page"
            assert "/proxy/" not in called_url


class TestInternalTargetRouting:
    """When TARGET_HOST is dummy-target or localhost,
    the proxy should keep the /proxy/ prefix."""

    @patch("main.httpx.AsyncClient")
    @pytest.mark.anyio()
    async def test_keeps_proxy_prefix_for_dummy_target(self, mock_client_cls):
        """Internal target: /proxy/page → http://dummy-target:3001/proxy/page"""
        with patch.dict(os.environ, {
            "TARGET_HOST": "dummy-target",
            "TARGET_PORT": "3001",
        }):
            import importlib
            import main
            importlib.reload(main)

            assert main._is_external_target is False

            mock_response = AsyncMock()
            mock_response.headers = {"content-type": "text/plain"}
            mock_response.content = b"hello"
            mock_response.status_code = 200

            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_instance

            client = TestClient(main.app)
            response = client.get("/proxy/some/page")

            mock_instance.get.assert_called_once()
            called_url = mock_instance.get.call_args[0][0]
            assert called_url == "http://dummy-target:3001/proxy/some/page"


class TestIsExternalTarget:
    """Test the _is_external_target detection logic."""

    def test_dummy_target_is_internal(self):
        with patch.dict(os.environ, {"TARGET_HOST": "dummy-target"}):
            import importlib
            import main
            importlib.reload(main)
            assert main._is_external_target is False

    def test_localhost_is_internal(self):
        with patch.dict(os.environ, {"TARGET_HOST": "localhost"}):
            import importlib
            import main
            importlib.reload(main)
            assert main._is_external_target is False

    def test_127_0_0_1_is_internal(self):
        with patch.dict(os.environ, {"TARGET_HOST": "127.0.0.1"}):
            import importlib
            import main
            importlib.reload(main)
            assert main._is_external_target is False

    def test_host_docker_internal_is_external(self):
        with patch.dict(os.environ, {"TARGET_HOST": "host.docker.internal"}):
            import importlib
            import main
            importlib.reload(main)
            assert main._is_external_target is True

    def test_custom_hostname_is_external(self):
        with patch.dict(os.environ, {"TARGET_HOST": "my-app.local"}):
            import importlib
            import main
            importlib.reload(main)
            assert main._is_external_target is True


class TestPathTraversal:
    def test_rejects_path_with_dotdot(self, internal_client):
        """Path traversal via embedded .. in a deeper path segment."""
        response = internal_client.get("/proxy/foo/..%2F..%2Fetc/passwd")
        assert response.status_code == 400

    def test_rejects_url_encoded_traversal(self, internal_client):
        """Path traversal via fully URL-encoded dots."""
        response = internal_client.get("/proxy/foo%2F%2e%2e%2F%2e%2e%2Fetc%2Fpasswd")
        assert response.status_code == 400
