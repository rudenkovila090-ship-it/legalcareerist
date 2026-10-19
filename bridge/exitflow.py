"""Путь выхода из сообщества с обратной связью: причины → «Продолжить» → только потом «Отписаться».

Путь намеренно длиннее обычной отписки: человек отмечает, что пошло не так (можно несколько причин,
«Другое» с текстовым ответом), нажимает «Продолжить», и лишь после этого видит кнопку «Отписаться».
Причины складываются в журнал и в статистику, менеджер получает карточку. Тексты и список причин: config/exit_survey.json.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass

CALLBACK_PREFIX = "x"  # x:t:<номер> (отметить причину), x:c (продолжить), x:u (отписаться), x:s (остаться), x:start
PER_ROW = 5


@dataclass(frozen=True)
class ExitConfig:
    intro: str
    reasons: tuple[str, ...]
    other_index: int | None  # номер пункта «Другое» (с текстовым ответом) или None
    other_prompt: str
    other_saved: str
    need_one: str
    final: str
    continue_button: str
    unsubscribe_button: str
    stay_button: str
    stay_text: str
    done_text: str
    leave_note: str  # пометка в карточке менеджеру: что сделать вручную


def load_exit(path: str) -> ExitConfig | None:
    """Нет файла или enabled=false — путь выхода выключен."""
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)
    if not raw.get("enabled", True):
        return None
    reasons = tuple(raw["reasons"])
    if not 2 <= len(reasons) <= 25:
        raise ValueError("exit_survey.json: нужно от 2 до 25 причин")
    if any(not r.strip() or len(r) > 200 for r in reasons):
        raise ValueError("exit_survey.json: причина пустая или длиннее 200 символов")
    other = raw.get("other_index")
    if other is not None and not 0 <= int(other) < len(reasons):
        raise ValueError("exit_survey.json: other_index указывает на несуществующую причину")
    return ExitConfig(
        intro=raw["intro"],
        reasons=reasons,
        other_index=None if other is None else int(other),
        other_prompt=raw["other_prompt"],
        other_saved=raw["other_saved"],
        need_one=raw["need_one"],
        final=raw["final"],
        continue_button=raw["continue_button"],
        unsubscribe_button=raw["unsubscribe_button"],
        stay_button=raw["stay_button"],
        stay_text=raw["stay_text"],
        done_text=raw["done_text"],
        leave_note=raw.get("leave_note", ""),
    )


class ExitFlow:
    def __init__(self, config: ExitConfig) -> None:
        self.cfg = config

    def text(self) -> str:
        """Вопрос со всем списком: полные формулировки в тексте, а на кнопках только номера (длинный текст на кнопке обрезается)."""
        lines = [f"{i}. {reason}" for i, reason in enumerate(self.cfg.reasons, start=1)]
        return f"{self.cfg.intro}\n\n" + "\n".join(lines)

    def keyboard(self, selected: list[int]) -> list[list[dict]]:
        chosen = set(selected)
        numbers = [
            {"text": f"✅ {i + 1}" if i in chosen else str(i + 1), "callback_data": f"{CALLBACK_PREFIX}:t:{i}"}
            for i in range(len(self.cfg.reasons))
        ]
        rows = [numbers[i : i + PER_ROW] for i in range(0, len(numbers), PER_ROW)]
        rows.append([{"text": self.cfg.continue_button, "callback_data": f"{CALLBACK_PREFIX}:c"}])
        return rows

    def final_keyboard(self) -> list[list[dict]]:
        return [
            [{"text": self.cfg.unsubscribe_button, "callback_data": f"{CALLBACK_PREFIX}:u"}],
            [{"text": self.cfg.stay_button, "callback_data": f"{CALLBACK_PREFIX}:s"}],
        ]

    def reasons_of(self, selected: list[int]) -> list[str]:
        return [self.cfg.reasons[i] for i in sorted(set(selected)) if 0 <= i < len(self.cfg.reasons)]
