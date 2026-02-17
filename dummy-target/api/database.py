# dummy-target/api/database.py
"""SQLite database engine and session factory using SQLModel."""

from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DB_PATH = Path(__file__).parent / "data.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, echo=False)


def create_db_and_tables() -> None:
    """Create all tables from SQLModel metadata. Safe to call multiple times."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Yield a database session for FastAPI dependency injection."""
    with Session(engine) as session:
        yield session
