# dummy-target/api/main.py
"""FastAPI application for the dummy-target task manager backend."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.database import create_db_and_tables
from api.routes.tasks import router as tasks_router

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3001,http://localhost:5173,http://localhost:8000",
).split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup via SQLModel create_all."""
    create_db_and_tables()
    yield


app = FastAPI(title="DummyApp Task Manager", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(tasks_router)


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "dummy-target-api"}
