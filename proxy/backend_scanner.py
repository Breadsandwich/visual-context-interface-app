"""AST-based scanner for FastAPI backend structure.

Parses Python source files to extract route definitions, SQLModel classes,
and database configuration without importing the target modules.
"""

import ast
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# HTTP methods that correspond to FastAPI/APIRouter decorators
_HTTP_METHODS = frozenset({"get", "post", "put", "delete", "patch", "options", "head"})


def _extract_routes(tree: ast.Module, file_path: str) -> list[dict[str, Any]]:
    """Extract route definitions from @router.method('/path') or @app.method('/path') decorators."""
    routes: list[dict[str, Any]] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            # Match: @router.get("/path") or @app.post("/path")
            if not isinstance(decorator, ast.Call):
                continue
            func = decorator.func
            if not isinstance(func, ast.Attribute):
                continue
            method = func.attr
            if method not in _HTTP_METHODS:
                continue
            # Extract the path argument (first positional arg)
            path = ""
            if decorator.args and isinstance(decorator.args[0], ast.Constant):
                path = str(decorator.args[0].value)
            routes.append({
                "method": method.upper(),
                "path": path,
                "function": node.name,
                "file": file_path,
                "line": node.lineno,
            })

    return routes


def _extract_models(tree: ast.Module, file_path: str) -> list[dict[str, Any]]:
    """Extract SQLModel class definitions with their fields."""
    models: list[dict[str, Any]] = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        # Check if any base class name contains 'SQLModel'
        is_sqlmodel = any(
            (isinstance(base, ast.Name) and "SQLModel" in base.id)
            or (isinstance(base, ast.Attribute) and "SQLModel" in base.attr)
            for base in node.bases
        )
        if not is_sqlmodel:
            continue
        # Check for table=True in keywords (only table models, not schemas)
        is_table = any(
            isinstance(kw.value, ast.Constant) and kw.value.value is True
            for kw in node.keywords
            if kw.arg == "table"
        )
        if not is_table:
            continue

        fields: list[dict[str, str]] = []
        for item in node.body:
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                type_str = ast.unparse(item.annotation) if item.annotation else "Any"
                fields.append({"name": item.target.id, "type": type_str})

        models.append({
            "name": node.name,
            "file": file_path,
            "line": node.lineno,
            "fields": fields,
        })

    return models


def _find_router_prefix(tree: ast.Module) -> str | None:
    """Find APIRouter(prefix=...) in the module."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = ""
        if isinstance(func, ast.Name):
            name = func.id
        elif isinstance(func, ast.Attribute):
            name = func.attr
        if name != "APIRouter":
            continue
        for kw in node.keywords:
            if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                return str(kw.value.value)
    return None


def scan_backend(api_dir: str | Path) -> dict[str, Any]:
    """Scan a FastAPI backend directory and return a structured map.

    Args:
        api_dir: Path to the backend API directory (e.g., 'dummy-target/api')

    Returns:
        Dict with 'endpoints', 'models', and 'database' keys.
    """
    api_path = Path(api_dir)
    if not api_path.is_dir():
        return {"endpoints": [], "models": [], "database": None}

    all_routes: list[dict[str, Any]] = []
    all_models: list[dict[str, Any]] = []
    db_info: dict[str, str] | None = None

    for py_file in sorted(api_path.rglob("*.py")):
        if py_file.name.startswith("__"):
            continue

        try:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))
        except (SyntaxError, UnicodeDecodeError) as exc:
            logger.warning("Failed to parse %s: %s", py_file, exc)
            continue

        # Use relative path from api_dir's parent for cleaner references
        rel_path = str(py_file.relative_to(api_path.parent))

        # Extract routes — resolve prefix from APIRouter
        prefix = _find_router_prefix(tree) or ""
        routes = _extract_routes(tree, rel_path)
        for route in routes:
            if prefix and not route["path"].startswith(prefix):
                route["path"] = prefix + route["path"]
        all_routes.extend(routes)

        # Extract models
        all_models.extend(_extract_models(tree, rel_path))

        # Look for database URL (sqlite reference)
        if "create_engine" in source:
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    if "sqlite" in node.value:
                        db_info = {"engine": "sqlite", "url": node.value}
                        break

    return {
        "endpoints": all_routes,
        "models": all_models,
        "database": db_info,
    }
