# dummy-target/api/database.py
"""SQLite database engine, session factory, and dev auto-migration using SQLModel."""

import logging
from enum import Enum
from pathlib import Path

from sqlalchemy import Column, inspect, text
from sqlalchemy.dialects.sqlite import dialect as sqlite_dialect
from sqlmodel import Session, SQLModel, create_engine

logger = logging.getLogger("auto_migrate")

DB_PATH = Path(__file__).parent / "data.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, echo=False)


def _compile_column_type(column: Column) -> str:
    """Compile a SQLAlchemy column type to a SQLite-compatible DDL string."""
    return column.type.compile(dialect=sqlite_dialect())


def _get_sqlite_default(column: Column) -> str:
    """Derive a SQL DEFAULT clause for NOT NULL columns added via ALTER TABLE.

    SQLite requires a default value when adding a NOT NULL column to an
    existing table. Returns an empty string if the column is nullable.
    """
    if column.nullable:
        return ""

    if column.default is not None and column.default.is_scalar:
        value = column.default.arg
        if isinstance(value, Enum):
            value = value.value
        if isinstance(value, bool):
            return f" DEFAULT {int(value)}"
        if isinstance(value, (int, float)):
            return f" DEFAULT {value}"
        escaped = str(value).replace("'", "''")
        return f" DEFAULT '{escaped}'"

    type_str = _compile_column_type(column).upper()
    if "INT" in type_str:
        return " DEFAULT 0"
    if "FLOAT" in type_str or "REAL" in type_str or "NUMERIC" in type_str:
        return " DEFAULT 0.0"
    if "BOOL" in type_str:
        return " DEFAULT 0"
    if "DATE" in type_str or "TIME" in type_str:
        return " DEFAULT '1970-01-01 00:00:00'"
    return " DEFAULT ''"


def auto_migrate() -> None:
    """Compare live DB schema against SQLModel metadata and apply migrations.

    - New columns → ALTER TABLE ADD COLUMN (preserves data)
    - Removed columns or type changes → DROP + recreate (data loss OK for dev)

    Only runs against tables that already exist in the database.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table_name, table in SQLModel.metadata.tables.items():
        if table_name not in existing_tables:
            continue

        db_columns = {col["name"]: col for col in inspector.get_columns(table_name)}
        model_columns = {col.name: col for col in table.columns}

        db_col_names = set(db_columns.keys())
        model_col_names = set(model_columns.keys())

        added = model_col_names - db_col_names
        removed = db_col_names - model_col_names

        # Check for type changes on shared columns
        type_changed = set()
        for col_name in db_col_names & model_col_names:
            db_type = str(db_columns[col_name]["type"]).upper()
            model_type = _compile_column_type(model_columns[col_name]).upper()
            if db_type != model_type:
                logger.debug(
                    "Type mismatch on '%s.%s': db=%s model=%s",
                    table_name, col_name, db_type, model_type,
                )
                type_changed.add(col_name)

        if not added and not removed and not type_changed:
            continue

        # If only additions, use ALTER TABLE ADD COLUMN (preserves data)
        if added and not removed and not type_changed:
            logger.info("Adding columns to '%s': %s", table_name, added)
            with engine.begin() as conn:
                for col_name in added:
                    col = model_columns[col_name]
                    col_type = _compile_column_type(col)
                    nullable = "" if col.nullable else " NOT NULL"
                    default = _get_sqlite_default(col)
                    stmt = (
                        f'ALTER TABLE "{table_name}" '
                        f'ADD COLUMN "{col_name}" {col_type}{nullable}{default}'
                    )
                    logger.info("  %s", stmt)
                    conn.execute(text(stmt))
            continue

        # Otherwise, drop and recreate the table
        reasons = []
        if removed:
            reasons.append(f"removed={removed}")
        if type_changed:
            reasons.append(f"type_changed={type_changed}")
        if added:
            reasons.append(f"added={added}")
        logger.warning(
            "Recreating table '%s' (%s) — existing data will be lost",
            table_name,
            ", ".join(reasons),
        )
        with engine.begin() as conn:
            conn.execute(text(f'DROP TABLE "{table_name}"'))
        table.create(engine)


def create_db_and_tables() -> None:
    """Create all tables from SQLModel metadata, then auto-migrate schema diffs."""
    SQLModel.metadata.create_all(engine)
    auto_migrate()


def get_session():
    """Yield a database session for FastAPI dependency injection."""
    with Session(engine) as session:
        yield session
