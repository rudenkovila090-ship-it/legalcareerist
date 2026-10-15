FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bridge ./bridge
COPY config ./config

# SQLite с диалогами и свежим токеном — смонтируйте /data как постоянный диск (volume)
ENV DB_PATH=/data/bridge.db
VOLUME /data

EXPOSE 8000
CMD ["sh", "-c", "uvicorn bridge.app:create_app_from_env --factory --host 0.0.0.0 --port ${PORT:-8000}"]
