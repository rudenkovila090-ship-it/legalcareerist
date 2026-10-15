from __future__ import annotations

from html import escape

TITLES = {
    "lead": "🆕 <b>Новая заявка из Instagram</b>",
    "handoff": "🙋 <b>Просят менеджера (Instagram)</b>",
    "message": "💬 <b>Новое сообщение в Instagram</b>",
    "comment": "💭 <b>Комментарий с ключевым словом</b>",
}


def format_card(card: dict) -> str:
    """HTML-карточка для менеджера в Telegram. Весь пользовательский текст экранируется."""
    lines = [TITLES.get(card.get("type", ""), "ℹ️ <b>Instagram</b>")]
    if card.get("segment"):
        lines.append(f"Сегмент: <b>{escape(card['segment'])}</b>")
    username = card.get("username")
    if username:
        lines.append(f'Instagram: <a href="https://instagram.com/{escape(username)}">@{escape(username)}</a>')
    else:
        lines.append(f"Instagram ID: <code>{escape(str(card.get('igsid', '')))}</code> (username недоступен)")
    if card.get("rule"):
        lines.append(f"Правило: <code>{escape(card['rule'])}</code>")
    if card.get("text"):
        lines.append(f"\n{escape(card['text'])}")
    for question, answer in card.get("qa", []):
        lines.append(f"\n<b>{escape(question)}</b>\n{escape(answer)}")
    if card.get("note"):
        lines.append(f"\n<i>{escape(card['note'])}</i>")
    return "\n".join(lines)
