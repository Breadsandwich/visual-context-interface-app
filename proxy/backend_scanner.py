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


def _extract_class_fields(node: ast.ClassDef) -> list[dict[str, str]]:
    """Extract annotated fields from a class body."""
    fields: list[dict[str, str]] = []
    for item in node.body:
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
            type_str = ast.unparse(item.annotation) if item.annotation else "Any"
            fields.append({"name": item.target.id, "type": type_str})
    return fields


def _resolve_parent_fields(
    class_node: ast.ClassDef, class_map: dict[str, ast.ClassDef]
) -> list[dict[str, str]]:
    """Collect fields from parent classes defined in the same module."""
    parent_fields: list[dict[str, str]] = []
    seen_names: set[str] = set()

    for base in class_node.bases:
        base_name = base.id if isinstance(base, ast.Name) else None
        if base_name and base_name in class_map:
            for field in _extract_class_fields(class_map[base_name]):
                if field["name"] not in seen_names:
                    parent_fields.append(field)
                    seen_names.add(field["name"])
    return parent_fields


def _extract_models(tree: ast.Module, file_path: str) -> list[dict[str, Any]]:
    """Extract SQLModel table class definitions with their fields (including inherited)."""
    models: list[dict[str, Any]] = []

    # Build a map of all class definitions for parent field resolution
    class_map: dict[str, ast.ClassDef] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            class_map[node.name] = node

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        # Detect SQLModel table classes via table=True keyword.
        # This is the strongest signal — only SQLModel uses this pattern.
        has_table_keyword = any(
            isinstance(kw.value, ast.Constant) and kw.value.value is True
            for kw in node.keywords
            if kw.arg == "table"
        )
        if not has_table_keyword:
            continue

        # Collect inherited fields first, then own fields (own fields override)
        parent_fields = _resolve_parent_fields(node, class_map)
        own_fields = _extract_class_fields(node)
        own_names = {f["name"] for f in own_fields}
        fields = [f for f in parent_fields if f["name"] not in own_names] + own_fields

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
        if prefix:
            routes = [
                {**r, "path": prefix + r["path"]} if not r["path"].startswith(prefix) else r
                for r in routes
            ]
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
