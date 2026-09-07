#!/usr/bin/env bash
# Запускается при старте сервера на Render
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
