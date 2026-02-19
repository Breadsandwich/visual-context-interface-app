# dummy-target/api/routes/tasks.py
"""CRUD endpoints for tasks."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from api.database import get_session
from api.models import Task, TaskCreate, TaskPriority, TaskStatus, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/")
def list_tasks(
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    session: Session = Depends(get_session),
) -> list[Task]:
    """List all tasks, optionally filtered by status and/or priority."""
    statement = select(Task)
    if status is not None:
        statement = statement.where(Task.status == status)
    if priority is not None:
        statement = statement.where(Task.priority == priority)
    statement = statement.order_by(Task.created_at.desc())
    return list(session.exec(statement).all())


@router.get("/{task_id}")
def get_task(task_id: int, session: Session = Depends(get_session)) -> Task:
    """Get a single task by ID."""
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/", status_code=201)
def create_task(body: TaskCreate, session: Session = Depends(get_session)) -> Task:
    """Create a new task."""
    task = Task.model_validate(body)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.put("/{task_id}")
def update_task(
    task_id: int, body: TaskUpdate, session: Session = Depends(get_session)
) -> Task:
    """Update an existing task. Only provided fields are changed."""
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, session: Session = Depends(get_session)) -> None:
    """Delete a task by ID."""
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(task)
    session.commit()
