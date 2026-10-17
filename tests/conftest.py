"""Fixtures mirror the real journal spreadsheet (dates are serial numbers, locale en_US)."""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest
from gspread.utils import a1_to_rowcol

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.dates import to_serial  # noqa: E402
from bot.models import METRICS  # noqa: E402
from bot.sheets import CONTACT_COLS, SALES_COLS, TASK_COLS, GOAL_COLS  # noqa: E402

TODAY = date(2026, 10, 17)
D = lambda d, m: to_serial(date(2026, m, d))  # noqa: E731


class FakeWorksheet:
    """Just enough of gspread.Worksheet for the Journal to run against."""

    def __init__(self, title: str, grid: list[list]):
        self.title = title
        self.grid = [list(r) for r in grid]
        self.row_count = max(1000, len(grid))
        self.formats: list[tuple[str, dict]] = []

    def get_all_values(self, **_):
        width = max((len(r) for r in self.grid), default=0)
        rows = [r + [""] * (width - len(r)) for r in self.grid]
        while rows and not any(str(c) != "" for c in rows[-1]):
            rows.pop()
        return rows

    def row_values(self, n):
        return self.grid[n - 1] if n <= len(self.grid) else []

    def batch_update(self, data, raw=True, **_):
        assert raw, "writes must be RAW so '+7...' is not parsed as a formula"
        for item in data:
            start = item["range"].split(":")[0]
            r0, c0 = a1_to_rowcol(start)
            for i, row in enumerate(item["values"]):
                for j, v in enumerate(row):
                    r, c = r0 + i, c0 + j
                    while len(self.grid) < r:
                        self.grid.append([])
                    line = self.grid[r - 1]
                    line.extend([""] * (c - len(line)))
                    line[c - 1] = v

    def batch_format(self, formats):
        self.formats += [(f["range"], f["format"]) for f in formats]

    def format(self, rng, fmt):
        self.formats.append((rng, fmt))

    def batch_clear(self, ranges):
        self.grid = self.grid[:1]

    def add_rows(self, n):
        self.row_count += n

    def freeze(self, **_):
        pass


class FakeSpreadsheet:
    def __init__(self, sheets: dict[str, list[list]]):
        self.sheets = {k: FakeWorksheet(k, v) for k, v in sheets.items()}

    def worksheet(self, name):
        import gspread
        if name not in self.sheets:
            raise gspread.WorksheetNotFound(name)
        return self.sheets[name]

    def add_worksheet(self, title, rows, cols):
        self.sheets[title] = FakeWorksheet(title, [])
        return self.sheets[title]


@pytest.fixture
def actions_values():
    return [["Дата", *METRICS.values()], [D(16, 10), 2], [D(17, 10)]]


@pytest.fixture
def contacts_values():
    return [
        CONTACT_COLS,
        [D(15, 10), "Инстаграм", "Кандидат", "khaustovasya", "Студентка 2 курса, хочет стажировку",
         "В работе", "Предложить карьерную консультацию", "", "Предложение сделано"],
        [D(16, 10), "Телеграм", "Работодатель", "@katushusta", "Рекрутинг: юрист в Сбер",
         "В работе", "Дождаться ответа", "", "Написал с предложением"],
        [D(16, 10), "Другое", "Партнёр", "Ориана Полуновский (Институт адвокатуры)",
         "Партнёр Legal Night Jazz 2", "В работе", "Написать и напомнить", D(24, 10), "Обсудит с коллегами"],
        [D(16, 10), "Другое", "Партнёр", "Полина (ИИ Стриж)", "Партнёр Legal Night Jazz 2",
         "В работе", "Получить ответ", D(17, 10), "Посмотрит вечером"],
    ]


@pytest.fixture
def sales_values():
    return [SALES_COLS]


@pytest.fixture
def planes_values():
    return [
        ["Планы на месяц и списки для меню"],
        ["Показатель", "План на месяц", "Хорошо когда", "Примечание", "", "Источник", "Кто обратился", "Этап", "Направление"],
        ["Выручка Кадры, ₽", "150000", "↑", "", "", "Инстаграм", "Кандидат", "Новый", "Кадры"],
        ["Выручка Сообщество, ₽", "35000", "↑", "", "", "Телеграм", "Работодатель", "В работе", "Сообщество"],
        ["Касания работодателям", "200", "↑", "", "", "Сарафан", "Резидент", "Интервью", "Мероприятия"],
        ["Расходы, не больше, ₽", "25000", "↓", "", "", "Другое", "Партнёр", "Выход", "Другое"],
        [],
        ["Порог жёлтого светофора", "0.85"],
    ]


@pytest.fixture
def journal_sheets(actions_values, contacts_values, sales_values, planes_values):
    return {
        "Действия": actions_values, "Обращения": contacts_values, "Продажи": sales_values,
        "Планы": planes_values, "Сводка": [[]],
        "Задачи": [TASK_COLS], "План года": [GOAL_COLS],
    }
