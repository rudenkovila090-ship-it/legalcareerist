# Карьерный юрист

Воронка заявок: **Instagram даёт трафик, @LegalcareeristBot принимает заявки в Telegram**.

## Telegram-бот приёма заявок (основной путь)

Бот ведёт клиента по меню и вопросам, спрашивает согласие на обработку данных, запоминает источник (метка в ссылке `?start=…`) и присылает менеджерам карточку заявки. Менеджер отвечает на карточку, и ответ уходит клиенту. Есть выгрузка заявок в CSV.

**Запуск и настройка:** [docs/TELEGRAM_BOT.md](docs/TELEGRAM_BOT.md)

```bash
pip install -r requirements.txt
python -m bridge.tgbot --find-chat        # узнать ID группы менеджеров
python -m bridge.tgbot --check            # проверить настройку
python -m bridge.tgbot                    # запустить
```

## Instagram-мост (запасной путь, нужен собственный Instagram API)

Автоответ на комментарии с ключевыми словами и в Instagram DM через официальный API Meta. Требует приложения Meta, аккаунта разработчика и App Review: [docs/INSTAGRAM_SETUP.md](docs/INSTAGRAM_SETUP.md). Код готов и протестирован, но не подключён.

| Что | Где |
|---|---|
| Тексты, ключевые слова, вопросы | `config/flows.json` |
| Переменные окружения | `.env.example` |
| Код | `bridge/` |
| Тесты (90) | `tests/`: `pip install -r requirements-dev.txt && pytest` |
