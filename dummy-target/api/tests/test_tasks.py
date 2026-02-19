"""Tests for task CRUD operations including assignee field."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from api.main import app
from api.database import get_session
from api.models import Task


@pytest.fixture(name="session")
def session_fixture():
    """Create a fresh in-memory database for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    """Create a test client with overridden database session."""
    def get_session_override():
        yield session
    
    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_create_task_with_assignee(client: TestClient):
    """Test creating a task with an assignee."""
    response = client.post(
        "/api/tasks/",
        json={
            "title": "Test task with assignee",
            "assignee": "John Doe"
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test task with assignee"
    assert data["assignee"] == "John Doe"
    assert "id" in data


def test_create_task_without_assignee(client: TestClient):
    """Test creating a task without an assignee (should be null)."""
    response = client.post(
        "/api/tasks/",
        json={"title": "Unassigned task"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Unassigned task"
    assert data["assignee"] is None


def test_get_task_returns_assignee(client: TestClient):
    """Test that retrieving a task includes the assignee field."""
    # Create a task with assignee
    create_response = client.post(
        "/api/tasks/",
        json={
            "title": "Task for retrieval",
            "assignee": "Jane Smith"
        },
    )
    task_id = create_response.json()["id"]
    
    # Retrieve the task
    response = client.get(f"/api/tasks/{task_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["assignee"] == "Jane Smith"


def test_update_task_assignee(client: TestClient):
    """Test updating the assignee of an existing task."""
    # Create a task without assignee
    create_response = client.post(
        "/api/tasks/",
        json={"title": "Task to reassign"},
    )
    task_id = create_response.json()["id"]
    
    # Update with an assignee
    response = client.put(
        f"/api/tasks/{task_id}",
        json={"assignee": "Bob Wilson"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["assignee"] == "Bob Wilson"
    assert data["title"] == "Task to reassign"  # Other fields unchanged


def test_update_task_remove_assignee(client: TestClient):
    """Test removing the assignee from a task."""
    # Create a task with assignee
    create_response = client.post(
        "/api/tasks/",
        json={
            "title": "Task with assignee",
            "assignee": "Alice Brown"
        },
    )
    task_id = create_response.json()["id"]
    
    # Remove assignee by setting to null
    response = client.put(
        f"/api/tasks/{task_id}",
        json={"assignee": None},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["assignee"] is None
    assert data["title"] == "Task with assignee"


def test_list_tasks_includes_assignee(client: TestClient):
    """Test that listing tasks includes assignee information."""
    # Create tasks with different assignees
    client.post("/api/tasks/", json={"title": "Task 1", "assignee": "Person A"})
    client.post("/api/tasks/", json={"title": "Task 2", "assignee": "Person B"})
    client.post("/api/tasks/", json={"title": "Task 3"})  # No assignee
    
    # List all tasks
    response = client.get("/api/tasks/")
    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) == 3
    
    # Verify assignee field is present in all tasks
    assignees = [t["assignee"] for t in tasks]
    assert "Person A" in assignees
    assert "Person B" in assignees
    assert None in assignees
