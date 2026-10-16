from __future__ import annotations

from html import escape

TITLES = {
    "lead": "🆕 <b>Новая заявка из {channel}</b>",
    "handoff": "🙋 <b>Просят менеджера ({channel})</b>",
    "message": "💬 <b>Новое сообщение ({channel})</b>",
    "comment": "💭 <b>Комментарий с ключевым словом ({channel})</b>",
}


def channel_of(client_id: str) -> str:
    return "Telegram" if str(client_id).startswith("tg:") else "Instagram"


def format_card(card: dict) -> str:
    """HTML-карточка для менеджера в Telegram. Весь пользовательский текст экранируется."""
    client_id = str(card.get("igsid", ""))
    channel = channel_of(client_id)
    title = TITLES.get(card.get("type", ""), "ℹ️ <b>{channel}</b>")
    lines = [title.format(channel=channel)]
    if card.get("segment"):
        lines.append(f"Сегмент: <b>{escape(card['segment'])}</b>")
    if card.get("source"):
        lines.append(f"Источник: <code>{escape(card['source'])}</code>")

    username, name = card.get("username"), card.get("name")
    if channel == "Telegram":
        user_id = client_id.removeprefix("tg:")
        parts = [f'<a href="tg://user?id={escape(user_id)}">{escape(name or "клиент")}</a>']
        if username:
            parts.append(f'<a href="https://t.me/{escape(username)}">@{escape(username)}</a>')
        lines.append("Клиент: " + " · ".join(parts))
    elif username:
        lines.append(f'Instagram: <a href="https://instagram.com/{escape(username)}">@{escape(username)}</a>')
    else:
        lines.append(f"Instagram ID: <code>{escape(client_id)}</code> (username недоступен)")

    if card.get("rule"):
        lines.append(f"Правило: <code>{escape(card['rule'])}</code>")
    if card.get("text"):
        lines.append(f"\n{escape(card['text'])}")
    for question, answer in card.get("qa", []):
        lines.append(f"\n<b>{escape(question)}</b>\n{escape(answer)}")
    if card.get("note"):
        lines.append(f"\n<i>{escape(card['note'])}</i>")
    if channel == "Telegram":
        lines.append("\n<i>Ответьте на это сообщение: ваш ответ уйдёт клиенту.</i>")
    return "\n".join(lines)
