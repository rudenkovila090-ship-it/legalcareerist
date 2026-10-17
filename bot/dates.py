"""Date helpers. The journal stores dates as Google Sheets serial numbers."""
from __future__ import annotations

from datetime import date, datetime, timedelta

EPOCH = date(1899, 12, 30)
_MIN_SERIAL, _MAX_SERIAL = 36526, 73050  # years 2000..2100

WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]


def to_serial(d: date) -> int:
    return (d - EPOCH).days


def from_serial(n: float) -> date:
    return EPOCH + timedelta(days=int(n))


def parse_date(v) -> date | None:
    """Accepts a serial number, dd.mm.yyyy, dd.mm.yy or ISO yyyy-mm-dd."""
    if v is None or isinstance(v, bool) or v == "":
        return None
    if isinstance(v, (int, float)):
        return from_serial(v) if _MIN_SERIAL <= v <= _MAX_SERIAL else None
    s = str(v).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def fmt(d: date | None) -> str:
    return d.strftime("%d.%m.%Y") if d else ""


def short(d: date | None) -> str:
    return d.strftime("%d.%m") if d else ""


def weekday_name(d: date) -> str:
    return WEEKDAYS[d.weekday()]


def monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def iso_week_label(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"
