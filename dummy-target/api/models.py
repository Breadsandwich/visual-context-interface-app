# dummy-target/api/models.py
"""Task model for the task manager API."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskBase(SQLModel):
    """Shared fields for create/update operations."""
    title: str = Field(max_length=200)
    description: Optional[str] = Field(default=None)
    status: TaskStatus = Field(default=TaskStatus.todo)
    priority: TaskPriority = Field(default=TaskPriority.medium)
    due_date: Optional[datetime] = Field(default=None)
    category: Optional[str] = Field(default=None, max_length=100)


class Task(TaskBase, table=True):
    """Task database table."""
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    issue_flagged: bool = Field(default=False)
    issue_resolved: bool = Field(default=False)
    issue_description: Optional[str] = Field(default=None)


class TaskCreate(TaskBase):
    """Schema for creating a task. Title is required, rest have defaults."""
    pass


class TaskUpdate(SQLModel):
    """Schema for updating a task. All fields optional."""
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    category: Optional[str] = Field(default=None, max_length=100)
    issue_flagged: Optional[bool] = None
    issue_resolved: Optional[bool] = None
    issue_description: Optional[str] = None
