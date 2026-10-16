# Карьерный юрист

Бот принимает заявки там, где пишет клиент: **в Instagram** (комментарии и директ) и **в Telegram**. Заявки приходят менеджерам в Telegram, менеджер отвечает на карточку, и ответ уходит клиенту в тот канал, откуда он пришёл.

## Бот в Instagram (официальный API Meta)

Ответ на комментарии с ключевыми словами, диалог и квалификация в директе, передача менеджеру. Приложение Meta создаётся от аккаунта разработчика, мост запускается на сервере.

**Подключение и запуск:** [docs/INSTAGRAM_SETUP.md](docs/INSTAGRAM_SETUP.md)

```bash
cp .env.example .env && nano .env         # секреты Meta, Telegram, DOMAIN
docker compose up -d --build              # мост + HTTPS (Caddy)
python -m bridge.doctor --url https://<DOMAIN>   # самопроверка
```

## Telegram-бот приёма заявок

Тот же сценарий в Telegram: меню кнопками, вопросы, согласие на обработку данных, источник лида из ссылки (`?start=…`), карточка менеджерам, ответ менеджера клиенту, `/leads` и `/export` (CSV). Работает и отдельно, без Instagram: [docs/TELEGRAM_BOT.md](docs/TELEGRAM_BOT.md)

```bash
python -m bridge.tgbot --find-chat        # узнать ID группы менеджеров
python -m bridge.tgbot --check            # проверить настройку
python -m bridge.tgbot                    # запустить
```

| Что | Где |
|---|---|
| Тексты, ключевые слова, вопросы | `config/flows.json` |
| Переменные окружения | `.env.example` |
| Код | `bridge/` |
| Тесты (97) | `tests/`: `pip install -r requirements-dev.txt && pytest` |
