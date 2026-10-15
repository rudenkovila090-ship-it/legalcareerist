from bridge.webhook import CommentEvent, DmEvent


def comment(text="консультация", cid="c1", from_id="222", username="ivan", parent=None, media="m1"):
    return CommentEvent(cid, text, from_id, username, media, parent)


def dm(text, mid=None, sender="222", attachment=False):
    return DmEvent(sender, mid, text, attachment)


def kinds(actions):
    return [a.kind for a in actions]


# ---------------------------------------------------------------- комментарии
def test_keyword_comment_sends_private_reply_with_first_question_and_public_reply(engine, store):
    actions = engine.on_comment(comment("Консультация!!!"))
    assert kinds(actions) == ["private_reply", "public_reply"]
    assert actions[0].to == "c1" and "Коротко опишите ситуацию" in actions[0].text
    conv = store.get_conv("222")
    assert (conv.state, conv.segment, conv.step, conv.username) == ("question", "client", 0, "ivan")


def test_comment_without_keyword_is_ignored(engine):
    assert engine.on_comment(comment("классный пост")) == []


def test_comment_reply_in_thread_and_own_comment_are_ignored(engine):
    assert engine.on_comment(comment(parent="p1")) == []
    assert engine.on_comment(comment(from_id="111", cid="c2")) == []


def test_duplicate_comment_webhook_is_processed_once(engine):
    assert engine.on_comment(comment()) != []
    assert engine.on_comment(comment()) == []


def test_pay_rule_sends_link_without_changing_state(engine, store):
    actions = engine.on_comment(comment("оплата", cid="c3"))
    assert "https://pay.example.com/x" in actions[0].text
    assert store.get_conv("222").state == "idle"


def test_comment_lead_notification_is_optional(engine, settings):
    assert "notify" not in kinds(engine.on_comment(comment(cid="c10")))
    object.__setattr__(settings, "notify_comment_leads", True)
    notify = engine.on_comment(comment(cid="c11"))[-1]
    assert notify.kind == "notify" and notify.card["rule"] == "client"


# ---------------------------------------------------------------- диалог и квалификация
def test_full_qualification_creates_lead_for_manager(engine, store):
    engine.on_comment(comment("подбор"))  # employer, ждём ответ на первый вопрос
    a = engine.on_dm(dm("Ищем корпоративного юриста, 5+ лет", "m1"))
    assert "компании" in a[0].text.lower()
    a = engine.on_dm(dm("ООО Ромашка, Москва", "m2"))
    assert "связаться" in a[0].text
    a = engine.on_dm(dm("@romashka", "m3"))
    assert kinds(a) == ["dm", "notify"]
    card = a[1].card
    assert card["type"] == "lead" and card["username"] == "ivan"
    assert [x[1] for x in card["qa"]] == ["Ищем корпоративного юриста, 5+ лет", "ООО Ромашка, Москва", "@romashka"]
    assert store.get_conv("222").state == "done" and store.count_leads() == 1


def test_first_dm_shows_menu_then_digit_starts_segment(engine, store):
    a = engine.on_dm(dm("Здравствуйте", "m1"))
    assert "1 — " in a[0].text and store.get_conv("222").state == "menu"
    a = engine.on_dm(dm("3", "m2"))
    assert "специализация" in a[0].text and store.get_conv("222").segment == "candidate"


def test_unrecognized_menu_answer_repeats_menu(engine):
    engine.on_dm(dm("привет", "m1"))
    a = engine.on_dm(dm("абракадабра", "m2"))
    assert "Не получилось распознать" in a[0].text and "1 — " in a[0].text


def test_handoff_pauses_bot_and_forwards_further_messages(engine, store, clock):
    engine.on_dm(dm("привет", "m1"))
    a = engine.on_dm(dm("Менеджер", "m2"))
    assert kinds(a) == ["dm", "notify"] and a[1].card["type"] == "handoff"
    # пока ведёт менеджер — бот молчит, сообщение уходит менеджеру в Telegram
    a = engine.on_dm(dm("а когда ответите?", "m3"))
    assert kinds(a) == ["notify"] and a[0].card["text"] == "а когда ответите?"
    # через HUMAN_MODE_HOURS бот снова отвечает
    clock.now += 13 * 3600
    a = engine.on_dm(dm("добрый день", "m4"))
    assert kinds(a) == ["dm"] and "1 — " in a[0].text


def test_word_man_inside_long_answer_is_not_handoff(engine):
    engine.on_comment(comment("консультация"))
    a = engine.on_dm(dm("Я человек, который 5 лет судится с застройщиком из-за квартиры", "m1"))
    assert kinds(a) == ["dm"] and "городе или стране" in a[0].text


def test_optout_silences_bot_until_menu(engine):
    a = engine.on_dm(dm("стоп", "m1"))
    assert "автоматических сообщений больше не будет" in a[0].text
    assert engine.on_dm(dm("привет", "m2")) == []
    a = engine.on_dm(dm("меню", "m3"))
    assert "1 — " in a[0].text


def test_message_after_completion_is_forwarded_to_manager(engine):
    engine.on_comment(comment("сообщество"))
    engine.on_dm(dm("Мероприятия", "m1"))
    engine.on_dm(dm("+79990000000", "m2"))
    a = engine.on_dm(dm("Добавлю: интересует Москва", "m3"))
    assert kinds(a) == ["dm", "notify"] and "Москва" in a[1].card["text"]


def test_attachment_during_question_asks_for_text(engine):
    engine.on_comment(comment("консультация"))
    a = engine.on_dm(dm(None, "m1", attachment=True))
    assert "ответьте, пожалуйста, текстом" in a[0].text


def test_duplicate_dm_and_own_dm_are_ignored(engine):
    assert engine.on_dm(dm("привет", "m1")) != []
    assert engine.on_dm(dm("привет", "m1")) == []
    assert engine.on_dm(dm("привет", "m9", sender="111")) == []
