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

# По умолчанию: Instagram-мост (вебхуки) вместе с опросом Telegram (ответы менеджеров клиентам).
# Только Telegram-бот без Instagram: docker run … legalcareerist-bot python -m bridge.tgbot
EXPOSE 8000
CMD ["uvicorn", "bridge.app:create_app_from_env", "--factory", "--host", "0.0.0.0", "--port", "8000"]
