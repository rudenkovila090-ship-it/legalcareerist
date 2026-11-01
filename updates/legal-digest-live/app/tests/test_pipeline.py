import unittest
from datetime import date, datetime, time, timezone
from types import SimpleNamespace as NS

from digest import folders, render
from digest.store import Item, Store

TODAY = date(2026, 10, 24)
POSTED = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


def item(msg_id, kind="event", title="Митап", event_date=None, event_time=None, deadline=None, channel="Канал", channel_id=1):
    return Item(channel_id, msg_id, kind, title, channel, f"https://t.me/c/{channel_id}/{msg_id}",
                event_date, event_time, deadline, POSTED)


class StoreTests(unittest.TestCase):
    def test_pending_window_and_mark_sent(self):
        store = Store(":memory:")
        soon = item(1, event_date=date(2026, 10, 28))
        far = item(2, event_date=date(2026, 12, 31))
        past = item(3, event_date=date(2026, 10, 1))
        undated = item(4)
        vacancy = item(5, kind="vacancy")
        for i in (soon, far, past, undated, vacancy):
            store.add_item(i)
        pending = store.pending_items(TODAY, horizon_days=14)
        self.assertEqual({i.msg_id for i in pending}, {1, 4, 5})
        store.mark_sent(pending)
        self.assertEqual(store.pending_items(TODAY, 14), [])
        # далёкое мероприятие всплывает, когда до него остаётся меньше horizon дней
        self.assertEqual([i.msg_id for i in store.pending_items(date(2026, 12, 20), 14)], [2])

    def test_item_roundtrip_and_duplicates(self):
        store = Store(":memory:")
        original = item(1, event_date=date(2026, 10, 28), event_time=time(19, 0), deadline=date(2026, 10, 27))
        store.add_item(original)
        store.add_item(original)
        self.assertEqual(store.pending_items(TODAY, 14), [original])

    def test_channel_pointer(self):
        store = Store(":memory:")
        self.assertEqual(store.last_msg_id(7), 0)
        store.set_last_msg_id(7, "Канал", 120)
        store.set_last_msg_id(7, "Канал (новое имя)", 150)
        self.assertEqual(store.last_msg_id(7), 150)


class RenderTests(unittest.TestCase):
    def test_three_sections_are_separate_messages_in_a_fixed_order(self):
        items = [
            item(1, title="Вебинар по налогам", event_date=date(2026, 10, 28)),
            item(2, kind="vacancy", title="Юрист в корпоративную практику"),
            Item(1, 3, "news", "Анна Иванова назначена партнёром", "Закон.ру", "https://t.me/c/1/3", None, None, None,
                 POSTED, subtype="Назначение", people=("Анна Иванова",)),
        ]
        events, vacancies, news = render.build_digest(items, TODAY)
        self.assertIn("Мероприятия · 24.10.2026", events)
        self.assertIn("Вакансии · 24.10.2026", vacancies)
        self.assertIn("Новости юридического рынка · 24.10.2026", news)
        self.assertNotIn("Вакансии", events)
        self.assertNotIn("Вебинар", vacancies + news)

    def test_only_nonempty_sections_are_sent(self):
        messages = render.build_digest([item(1, kind="vacancy")], TODAY)
        self.assertEqual(len(messages), 1)
        self.assertIn("Вакансии", messages[0])

    def test_event_card_follows_the_agreed_structure(self):
        card = Item(1, 1, "event", "Вебинар: налоговые риски бизнеса", "Закон.ру", "https://t.me/c/1/1",
                    date(2026, 10, 30), time(15, 0), date(2026, 10, 29), POSTED, work_format="онлайн",
                    price="Бесплатно, по регистрации", event_end=time(16, 30),
                    topic="Налоговые претензии и субсидиарные риски.", audience=("инхаусам", "руководителям"),
                    reg_url="https://example.com/reg?a=1&b=2")
        (text,) = render.build_digest([card], TODAY)
        for expected in (
            "<b>1. Вебинар: налоговые риски бизнеса</b>",
            "📅 <b>30 октября (пт), 15:00–16:30</b>",
            "🖥 Онлайн",
            "🎟 Бесплатно, по регистрации",
            "⏰ Регистрация до 29.10",
            "<b>О чём:</b> Налоговые претензии и субсидиарные риски.",
            "<b>Кому будет полезно:</b> инхаусам, руководителям",
            '→ <a href="https://example.com/reg?a=1&amp;b=2">Подробнее и регистрация</a>',
        ):
            self.assertIn(expected, text)
        self.assertNotIn("Почему стоит обратить внимание", text)

    def test_offline_card_shows_city_and_the_post_link(self):
        card = Item(1, 1, "event", "Конференция Legal Business", "Канал", "https://t.me/c/1/1",
                    date(2026, 11, 12), time(10, 0), None, POSTED, work_format="офлайн", city="Москва")
        (text,) = render.build_digest([card], TODAY)
        self.assertIn("📍 Офлайн, Москва", text)
        self.assertIn('🔗 Пост: <a href="https://t.me/c/1/1">t.me/c/1/1</a>', text)
        self.assertNotIn("В посте", text)  # других ссылок в посте нет
        self.assertNotIn("🎟", text)
        self.assertNotIn("О чём", text)

    def test_cards_are_numbered_by_date_and_undated_ones_come_last(self):
        items = [
            item(1, title="Поздний <митап>", event_date=date(2026, 11, 5), channel="A & B"),
            item(2, title="Ранний митап", event_date=date(2026, 10, 28), event_time=time(19, 0)),
            item(3, title="Ранний митап", event_date=date(2026, 10, 28), event_time=time(19, 0), channel="Другой", channel_id=2),
            item(4, title="Приглашение без даты"),
        ]
        (text,) = render.build_digest(items, TODAY)
        self.assertIn("Всего: 3", text)
        self.assertLess(text.index("1. Ранний митап"), text.index("2. Поздний"))
        self.assertLess(text.index("2. Поздний"), text.index("3. Приглашение без даты"))
        self.assertIn("Дата не указана", text)
        self.assertIn("ещё постов: 1", text)
        self.assertIn("Поздний &lt;митап&gt;", text)
        self.assertIn("A &amp; B", text)
        self.assertEqual(text.count("Ранний митап"), 1)

    def test_news_block_shows_type_people_and_summary(self):
        news = Item(1, 3, "news", "Денис Бушнев присоединился к Firm.One", "РУЛЬФЫ", "https://t.me/c/1/3", None, None, None,
                    POSTED, subtype="Карьерный переход", people=("Денис Бушнев",),
                    topic="Партнёром практики стал известный юрист.")
        (text,) = render.build_digest([news], TODAY)
        self.assertIn("<b>Карьерный переход</b> — Денис Бушнев", text)
        self.assertIn('<a href="https://t.me/c/1/3">Денис Бушнев присоединился к Firm.One</a>', text)
        self.assertIn("Партнёром практики стал известный юрист.", text)

    def test_same_person_news_from_several_channels_is_shown_once(self):
        def news(msg, channel_id, title):
            return Item(channel_id, msg, "news", title, f"Канал {channel_id}", f"https://t.me/c/{channel_id}/{msg}",
                        None, None, None, POSTED, subtype="Карьерный переход", people=("Денис Бушнев",))
        items = [news(1, 1, "Денис Бушнев присоединился к Firm.One"), news(2, 2, "Бушнев Денис теперь партнёр Firm.One")]
        (text,) = render.build_digest(items, TODAY)
        self.assertIn("Всего: 1", text)
        self.assertIn("ещё постов: 1", text)

    def test_same_channel_posts_about_one_event_are_merged(self):
        day = date(2026, 10, 31)
        items = [item(n, title=title, event_date=day, channel="Юридический бизнес России")
                 for n, title in ((1, "Партнерство — дело тонкое"), (2, "Рецензия на заключение эксперта"),
                                  (3, "Конференция Legal Business: программа"))]
        (text,) = render.build_digest(items, TODAY)
        self.assertIn("Всего: 1", text)
        self.assertIn("ещё постов: 2", text)
        self.assertIn("Конференция Legal Business: программа", text)  # самый содержательный заголовок
        self.assertNotIn("Партнерство", text)

    def test_same_channel_same_day_but_different_time_stays_separate(self):
        items = [item(1, title="Круглый стол утром", event_date=date(2026, 10, 29), event_time=time(10, 0)),
                 item(2, title="Круглый стол днём", event_date=date(2026, 10, 29), event_time=time(11, 0))]
        (text,) = render.build_digest(items, TODAY)
        self.assertIn("Всего: 2", text)

    def test_empty_digest(self):
        (text,) = render.build_digest([], TODAY)
        self.assertIn("не нашлось", text)

    def test_long_digest_is_split_without_losing_items(self):
        items = [item(n, title=f"Мероприятие номер {n} " + "очень длинное название " * 3, event_date=date(2026, 11, 1),
                      channel_id=n)
                 for n in range(1, 201)]
        messages = render.build_digest(items, TODAY)
        self.assertGreater(len(messages), 1)
        self.assertTrue(all(len(m) <= 4096 for m in messages))
        joined = "\n".join(messages)
        for n in (1, 100, 200):
            self.assertIn(f"{n}. Мероприятие номер {n} ", joined)
        self.assertEqual(joined.count("📅"), 200)


class FolderTests(unittest.TestCase):
    peers = staticmethod(lambda *ids: [NS(channel_id=i, access_hash=0) for i in ids])

    def filters(self):
        return NS(filters=[
            NS(),  # «Все чаты»: без названия
            NS(title=NS(text="Мониторинг"), include_peers=self.peers(10, 11) + [NS(user_id=5)],
               pinned_peers=self.peers(12), exclude_peers=[], broadcasts=False),
            NS(title="Каналы", include_peers=[], pinned_peers=[], exclude_peers=self.peers(20), broadcasts=True),
        ])

    def test_explicit_channels_new_and_old_title_formats(self):
        folder = folders.pick(self.filters(), "  мониторинг ")
        self.assertEqual(folder.ids, frozenset({10, 11, 12}))
        self.assertTrue(folder.wants(10))
        self.assertFalse(folder.wants(99))

    def test_all_channels_folder_with_exclusions(self):
        folder = folders.pick(self.filters().filters, "Каналы")  # старый формат: просто список
        self.assertTrue(folder.wants(99))
        self.assertFalse(folder.wants(20))

    def test_missing_folder_lists_available(self):
        with self.assertRaises(folders.FolderNotFound) as ctx:
            folders.pick(self.filters(), "Новости")
        self.assertIn("«Мониторинг»", str(ctx.exception))
        self.assertIn("FOLDER_NAME=*", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
