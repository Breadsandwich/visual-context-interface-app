"""FastAPI proxy service for Visual Context Interface."""

import asyncio
import json as json_module
import logging
import os
from urllib.parse import unquote

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, field_validator

from datetime import datetime, timezone
from injection import inject_inspector_script, rewrite_asset_paths
from source_editor import (
    partition_edits,
    apply_inline_style_edit,
    apply_css_class_edit,
    find_css_file,
    extract_classes_from_selector,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Visual Context Interface Proxy")

# CORS configuration - restricted to known origins
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Frame-Options"],
)

TARGET_HOST = os.getenv("TARGET_HOST", "localhost")
TARGET_PORT = os.getenv("TARGET_PORT", "3001")
INSPECTOR_DIR = (Path(__file__).parent.parent / "inspector").resolve()
VCI_OUTPUT_DIR = os.getenv("VCI_OUTPUT_DIR", "")

# When True, the proxy strips the /proxy/ prefix before forwarding.
# The bundled dummy-target serves from /proxy/ so it needs the prefix kept.
_is_external_target = TARGET_HOST not in ("dummy-target", "localhost", "127.0.0.1")


def get_target_url() -> str:
    """Get the base URL for the target application."""
    return f"http://{TARGET_HOST}:{TARGET_PORT}"


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "target": f"{TARGET_HOST}:{TARGET_PORT}",
        "external": _is_external_target,
    }


class AnalyzeImageRequest(BaseModel):
    image_data_url: str = Field(..., description="Base64 data URL of the image")
    context: str = Field("", description="Optional context hint", max_length=500)

    @field_validator("image_data_url")
    @classmethod
    def validate_data_url(cls, v: str) -> str:
        if not v.startswith("data:image/"):
            raise ValueError("Must be a valid image data URL")
        if len(v) > 10 * 1024 * 1024:
            raise ValueError("Image data too large (max ~10MB)")
        return v


@app.post("/api/analyze-image")
async def analyze_image_endpoint(request_body: AnalyzeImageRequest):
    """Analyze an image using Claude Vision API."""
    try:
        from vision import analyze_image

        result = await asyncio.to_thread(
            analyze_image,
            request_body.image_data_url,
            request_body.context,
        )
        return {"success": True, "data": result}
    except json_module.JSONDecodeError as e:
        logger.error(f"Claude returned non-JSON response: {e}")
        return Response(
            content=json_module.dumps({"success": False, "error": "Invalid response from vision API"}),
            status_code=502,
            media_type="application/json",
        )
    except ValueError as e:
        logger.warning(f"Vision config error: {e}")
        return Response(
            content=json_module.dumps({"success": False, "error": str(e)}),
            status_code=503,
            media_type="application/json",
        )
    except Exception:
        logger.exception("Vision analysis failed")
        return Response(
            content=json_module.dumps({"success": False, "error": "Analysis failed"}),
            status_code=500,
            media_type="application/json",
        )


class ExportContextRequest(BaseModel):
    payload: dict = Field(..., description="The VCI context payload to export")

    @field_validator("payload")
    @classmethod
    def validate_payload(cls, v: dict) -> dict:
        if not isinstance(v, dict):
            raise ValueError("Payload must be a JSON object")
        serialized = json_module.dumps(v)
        if len(serialized) > 5 * 1024 * 1024:
            raise ValueError("Payload too large (max 5MB)")
        return v


@app.post("/api/export-context")
async def export_context(request_body: ExportContextRequest):
    """Export VCI context payload to .vci/context.json on disk."""
    if not VCI_OUTPUT_DIR:
        return Response(
            content=json_module.dumps({
                "success": False,
                "error": "VCI_OUTPUT_DIR not configured. Set it to your project directory.",
            }),
            status_code=503,
            media_type="application/json",
        )

    try:
        # Resolve with strict=True to ensure directory exists and follow symlinks
        try:
            output_base = Path(VCI_OUTPUT_DIR).resolve(strict=True)
        except (FileNotFoundError, RuntimeError, OSError):
            return Response(
                content=json_module.dumps({
                    "success": False,
                    "error": f"VCI_OUTPUT_DIR does not exist: {VCI_OUTPUT_DIR}",
                }),
                status_code=503,
                media_type="application/json",
            )

        if not output_base.is_dir():
            return Response(
                content=json_module.dumps({
                    "success": False,
                    "error": "VCI_OUTPUT_DIR must be a directory",
                }),
                status_code=503,
                media_type="application/json",
            )

        vci_dir = output_base / ".vci"
        history_dir = vci_dir / "history"

        # Validate paths stay within output_base before any filesystem writes
        output_base_str = str(output_base)
        if not str((output_base / ".vci").resolve()).startswith(output_base_str):
            logger.warning("Path traversal attempt in export-context")
            return Response(content="Forbidden", status_code=403)

        vci_dir.mkdir(exist_ok=True)
        history_dir.mkdir(exist_ok=True)

        payload_json = json_module.dumps(request_body.payload, indent=2)

        # Write latest context
        context_path = vci_dir / "context.json"
        context_path.write_text(payload_json, encoding="utf-8")

        # Write timestamped history copy
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
        history_path = history_dir / f"{timestamp}.json"
        history_path.write_text(payload_json, encoding="utf-8")

        # Fire-and-forget trigger to agent service
        try:
            async with httpx.AsyncClient() as http:
                await http.post(
                    "http://localhost:8001/agent/run",
                    json={"context_path": str(context_path)},
                    timeout=2.0,
                )
        except Exception:
            logger.warning("Agent trigger failed (agent may not be running)")

        return {
            "success": True,
            "path": str(context_path),
            "historyPath": str(history_path),
        }

    except PermissionError:
        logger.error(f"Permission denied writing to {VCI_OUTPUT_DIR}")
        return Response(
            content=json_module.dumps({
                "success": False,
                "error": "Permission denied writing to output directory",
            }),
            status_code=403,
            media_type="application/json",
        )
    except Exception:
        logger.exception("Export context failed")
        return Response(
            content=json_module.dumps({"success": False, "error": "Export failed"}),
            status_code=500,
            media_type="application/json",
        )


@app.get("/api/agent-status")
async def agent_status():
    """Proxy agent status from internal agent service (sanitized)."""
    try:
        async with httpx.AsyncClient() as http:
            resp = await http.get("http://localhost:8001/agent/status", timeout=2.0)
            data = resp.json()
            return {
                "status": data.get("status", "unknown"),
                "filesChanged": data.get("filesChanged", []),
                "message": data.get("message"),
                "turns": data.get("turns", 0),
            }
    except Exception:
        return {"status": "unavailable"}


class ApplyEditsRequest(BaseModel):
    edits: list[dict] = Field(..., description="List of element edits to apply")

    @field_validator("edits")
    @classmethod
    def validate_edits(cls, v: list) -> list:
        if len(v) > 100:
            raise ValueError("Too many edits (max 100)")
        return v


@app.post("/api/apply-edits")
async def apply_edits_endpoint(request_body: ApplyEditsRequest):
    """Apply direct edits to source files via hybrid engine.

    Partitions edits into deterministic (direct file write) and AI-assisted.
    Executes deterministic edits immediately, returns AI-assisted for agent routing.
    """
    if not VCI_OUTPUT_DIR:
        return Response(
            content=json_module.dumps({
                "success": False,
                "error": "VCI_OUTPUT_DIR not configured",
            }),
            status_code=503,
            media_type="application/json",
        )

    try:
        project_dir = Path(VCI_OUTPUT_DIR).resolve(strict=True)
    except (FileNotFoundError, RuntimeError, OSError):
        return Response(
            content=json_module.dumps({
                "success": False,
                "error": f"VCI_OUTPUT_DIR does not exist: {VCI_OUTPUT_DIR}",
            }),
            status_code=503,
            media_type="application/json",
        )

    deterministic, ai_assisted = partition_edits(request_body.edits)

    applied = []
    failed_edits = []
    for edit in deterministic:
        source_file = edit.get("sourceFile")
        source_line = edit.get("sourceLine")
        unapplied_changes = []
        for change in edit.get("changes", []):
            success = apply_inline_style_edit(
                project_dir,
                source_file,
                source_line,
                change["property"],
                change["value"],
            )
            if not success and source_file:
                # Fallback: find associated CSS file and edit by class name
                css_path = find_css_file(project_dir, source_file)
                if css_path:
                    classes = extract_classes_from_selector(edit["selector"])
                    success = apply_css_class_edit(
                        css_path,
                        classes,
                        change["property"],
                        change["value"],
                    )
            if success:
                applied.append({
                    "selector": edit["selector"],
                    "property": change["property"],
                    "value": change["value"],
                })
            else:
                unapplied_changes.append(change)

        # Route unapplied deterministic edits to AI instead of marking as failed
        if unapplied_changes:
            ai_assisted.append({**edit, "changes": unapplied_changes})

    return {
        "success": True,
        "applied": applied,
        "failed": failed_edits,
        "aiAssisted": ai_assisted,
    }


@app.get("/inspector/{filename:path}")
async def serve_inspector(filename: str):
    """Serve inspector scripts with path traversal protection."""
    # Resolve the path and ensure it's within INSPECTOR_DIR
    try:
        file_path = (INSPECTOR_DIR / filename).resolve()
    except (ValueError, OSError):
        return Response(content="Invalid path", status_code=400)

    # Critical: Prevent path traversal attacks
    if not str(file_path).startswith(str(INSPECTOR_DIR)):
        logger.warning(f"Path traversal attempt blocked: {filename}")
        return Response(content="Forbidden", status_code=403)

    if file_path.exists() and file_path.is_file():
        content_type = "application/javascript"
        if filename.endswith(".css"):
            content_type = "text/css"
        return FileResponse(file_path, media_type=content_type)
    return Response(content="Not found", status_code=404)


@app.api_route("/proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_request(path: str, request: Request):
    """Proxy requests to target application with script injection."""
    # Reject WebSocket upgrades early — h11 crashes on 101 Switching Protocols
    if request.headers.get("upgrade", "").lower() == "websocket":
        return Response(content="WebSocket not supported through proxy", status_code=426)

    # Validate path doesn't contain traversal attempts (check decoded form too)
    decoded_path = unquote(path)
    if ".." in path or ".." in decoded_path:
        return Response(content="Invalid path", status_code=400)

    if _is_external_target:
        target_url = f"{get_target_url()}/{path}"
    else:
        target_url = f"{get_target_url()}/proxy/{path}"

    # Build query string
    if request.query_params:
        target_url += f"?{request.query_params}"

    # Forward headers (excluding sensitive ones)
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("origin", None)
    headers.pop("referer", None)

    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        try:
            # Forward the request
            if request.method == "GET":
                response = await client.get(target_url, headers=headers)
            elif request.method == "POST":
                body = await request.body()
                response = await client.post(target_url, headers=headers, content=body)
            elif request.method == "PUT":
                body = await request.body()
                response = await client.put(target_url, headers=headers, content=body)
            elif request.method == "DELETE":
                response = await client.delete(target_url, headers=headers)
            elif request.method == "PATCH":
                body = await request.body()
                response = await client.patch(target_url, headers=headers, content=body)
            else:
                response = await client.options(target_url, headers=headers)

            content_type = response.headers.get("content-type", "")
            content = response.content

            # Inject inspector script into HTML responses
            if "text/html" in content_type:
                html_content = content.decode("utf-8", errors="replace")
                html_content = rewrite_asset_paths(html_content)
                html_content = inject_inspector_script(html_content, FRONTEND_ORIGIN)
                content = html_content.encode("utf-8")

            # Build response headers
            response_headers = {}
            for key, value in response.headers.items():
                # Skip headers that shouldn't be forwarded
                if key.lower() not in [
                    "content-encoding",
                    "content-length",
                    "transfer-encoding",
                    "content-security-policy",
                    "x-frame-options",
                ]:
                    response_headers[key] = value

            # Add security headers for iframe embedding
            response_headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
            response_headers["Content-Security-Policy"] = f"frame-ancestors 'self' {FRONTEND_ORIGIN}"
            if not _is_external_target:
                response_headers["X-Frame-Options"] = "SAMEORIGIN"

            status_code = response.status_code
            if status_code < 200 or status_code >= 600:
                status_code = 502

            return Response(
                content=content,
                status_code=status_code,
                headers=response_headers,
                media_type=content_type.split(";")[0] if content_type else None,
            )

        except httpx.ConnectError:
            logger.error(f"Connection error to target: {TARGET_HOST}:{TARGET_PORT}")
            return Response(
                content="Service temporarily unavailable",
                status_code=502,
            )
        except httpx.TimeoutException:
            logger.error("Request to target timed out")
            return Response(
                content="Request timed out",
                status_code=504,
            )
        except Exception:
            logger.exception("Proxy error occurred")
            return Response(
                content="An internal error occurred",
                status_code=500,
            )


@app.api_route("/proxy", methods=["GET"])
async def proxy_root(request: Request):
    """Proxy root path."""
    return await proxy_request("", request)


if _is_external_target:

    # Paths that should never be forwarded to the target app
    _RESERVED_PREFIXES = ("health", "proxy", "inspector", "api", "docs", "openapi.json")

    @app.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    )
    async def forward_target_assets(path: str, request: Request):
        """Forward non-proxy requests to the target app.

        When the iframe is loaded cross-origin, Vite ES module imports use
        absolute paths like /node_modules/.vite/deps/react.js or /@vite/client.
        These arrive at the FastAPI server (port 8000) without the /proxy/ prefix
        and must be forwarded to the target application without HTML injection.
        """
        # Reject WebSocket upgrades early — h11 crashes on 101 Switching Protocols
        if request.headers.get("upgrade", "").lower() == "websocket":
            return Response(content="WebSocket not supported through proxy", status_code=426)

        first_segment = path.split("/")[0] if path else ""
        if first_segment in _RESERVED_PREFIXES:
            return Response(content="Not found", status_code=404)

        decoded_path = unquote(path)
        if ".." in path or ".." in decoded_path:
            return Response(content="Invalid path", status_code=400)

        target_url = f"{get_target_url()}/{path}"

        if request.query_params:
            target_url += f"?{request.query_params}"

        headers = dict(request.headers)
        headers.pop("host", None)
        headers.pop("origin", None)
        headers.pop("referer", None)

        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            try:
                body = await request.body() if request.method in ("POST", "PUT", "PATCH") else None

                response = await client.request(
                    method=request.method,
                    url=target_url,
                    headers=headers,
                    content=body,
                )

                content_type = response.headers.get("content-type", "")

                response_headers = {}
                for key, value in response.headers.items():
                    if key.lower() not in [
                        "content-encoding",
                        "content-length",
                        "transfer-encoding",
                        "content-security-policy",
                        "x-frame-options",
                    ]:
                        response_headers[key] = value

                response_headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
                response_headers["Content-Security-Policy"] = f"frame-ancestors 'self' {FRONTEND_ORIGIN}"

                status_code = response.status_code
                if status_code < 200 or status_code >= 600:
                    status_code = 502

                return Response(
                    content=response.content,
                    status_code=status_code,
                    headers=response_headers,
                    media_type=content_type.split(";")[0] if content_type else None,
                )

            except httpx.ConnectError:
                logger.error(f"Connection error to target: {TARGET_HOST}:{TARGET_PORT}")
                return Response(
                    content="Service temporarily unavailable",
                    status_code=502,
                )
            except httpx.TimeoutException:
                logger.error("Request to target timed out")
                return Response(
                    content="Request timed out",
                    status_code=504,
                )
            except Exception:
                logger.exception("Forward error occurred")
                return Response(
                    content="An internal error occurred",
                    status_code=500,
                )
