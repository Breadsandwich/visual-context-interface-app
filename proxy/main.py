"""FastAPI proxy service for Visual Context Interface."""

import logging
import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import httpx
from pathlib import Path

from injection import inject_inspector_script, rewrite_asset_paths

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


def get_target_url() -> str:
    """Get the base URL for the target application."""
    return f"http://{TARGET_HOST}:{TARGET_PORT}"


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


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
    # Validate path doesn't contain traversal attempts
    if ".." in path:
        return Response(content="Invalid path", status_code=400)

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
                html_content = inject_inspector_script(html_content)
                content = html_content.encode("utf-8")

            # Build response headers
            response_headers = {}
            for key, value in response.headers.items():
                # Skip headers that shouldn't be forwarded
                if key.lower() not in ["content-encoding", "content-length", "transfer-encoding"]:
                    response_headers[key] = value

            # Add security headers for iframe embedding
            response_headers["X-Frame-Options"] = "SAMEORIGIN"
            response_headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
            response_headers["Content-Security-Policy"] = f"frame-ancestors 'self' {FRONTEND_ORIGIN}"

            return Response(
                content=content,
                status_code=response.status_code,
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
        except Exception as e:
            logger.exception("Proxy error occurred")
            return Response(
                content="An internal error occurred",
                status_code=500,
            )


@app.api_route("/proxy", methods=["GET"])
async def proxy_root(request: Request):
    """Proxy root path."""
    return await proxy_request("", request)
