# Карьерный юрист

Воронка заявок и выдачи материалов: **Instagram приводит человека в Telegram-бота по диплинку, бот ведёт его дальше**. Без посредников и сторонних платформ.

```
Instagram: автоответ по кодовому слову (Meta Business Suite) → ссылка на бота
   → Telegram-бот: приветствие, воронки выдачи материалов, анкеты → карточка менеджеру
```

## Telegram-бот (основной путь)

Работает отдельно, без Meta, и подходит для сервера в РФ. Воронки выдачи по кодовому слову (вопросы кнопками, проверка подписки на канал, напоминание, опрос, дожим), приветствие по имени, диплинки, анкеты с проверкой телефона, согласие на обработку данных, источники и метки, карточки менеджерам, ответ менеджера клиенту, `/leads`, `/export`, `/contacts`, `/stats`, `/exits`; путь отписки от сообщества с обратной связью (причины → «Продолжить» → «Отписаться»); подсказка «используй кнопки» с передачей вопроса в техподдержку.

Запуск: [docs/TELEGRAM_BOT.md](docs/TELEGRAM_BOT.md). Воронки и связь с Instagram: [docs/FUNNELS.md](docs/FUNNELS.md). Переезд с BotHelp (перенос людей, меток, подписок): [docs/MIGRATION_FROM_BOTHELP.md](docs/MIGRATION_FROM_BOTHELP.md).

```bash
pip install -r requirements.txt
python -m bridge.tgbot --find-chat        # узнать ID группы менеджеров
python -m bridge.tgbot --check            # проверить настройку
python -m bridge.tgbot --links            # готовые диплинки для Instagram и QR
python -m bridge.tgbot                    # запустить
python -m bridge.bothelp_import файл.csv  # пробный перенос контактов из BotHelp (--apply: записать)
```

## Автоответы в самом Instagram

Встроенная автоматизация Meta Business Suite (Inbox → Автоматизации → «Свои ключевые слова») отвечает по слову коротким текстом и диплинком на нужный шаг бота. Настраивается в интерфейсе, код не нужен.

## Мост через официальный API Meta (необязательно)

Диалог и квалификация прямо в Instagram DM и на комментарии, ответ менеджера из Telegram в директ. Требует приложения Meta, сервера за пределами РФ и App Review: [docs/INSTAGRAM_SETUP.md](docs/INSTAGRAM_SETUP.md). Код готов и протестирован, но не подключён.

```bash
cp .env.example .env && nano .env         # секреты Meta, Telegram, DOMAIN
docker compose up -d --build              # мост + HTTPS (Caddy)
python -m bridge.doctor --url https://<DOMAIN>   # самопроверка
```

| Что | Где |
|---|---|
| Анкеты, тексты, вопросы | `config/flows.json` |
| Воронки: кодовые слова, материалы, приветствие | `config/funnels.json` |
| Переменные окружения | `.env.example` |
| Код | `bridge/` |
| Тесты (160) | `tests/`: `pip install -r requirements-dev.txt && pytest` |
