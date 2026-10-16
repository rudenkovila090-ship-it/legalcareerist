FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bridge ./bridge
COPY config ./config

# SQLite с заявками и состояниями диалогов — смонтируйте /data как постоянный диск (volume)
ENV DB_PATH=/data/bridge.db
VOLUME /data

# По умолчанию запускается Telegram-бот приёма заявок (порты не нужны, он сам опрашивает Telegram).
# Instagram-мост (webhook-сервер): docker run … legalcareerist-bot sh -c "uvicorn bridge.app:create_app_from_env --factory --host 0.0.0.0 --port 8000"
CMD ["python", "-m", "bridge.tgbot"]
