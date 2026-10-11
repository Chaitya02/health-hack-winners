"""Typed or spoken input that isn't a request is turned back, never sent to a team."""

import pytest

from app.validity import not_a_request


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("", "empty"),
        ("...", "empty"),
        ("123", "empty"),
        ("hello", "filler"),
        ("ok", "filler"),
        ("test", "filler"),
        ("Hola", "filler"),
        ("你好", "filler"),
        ("hmm ok", "filler"),
        ("asdfgh", "gibberish"),
        ("xkcdqz", "gibberish"),
        ("sdfsdfsdf", "gibberish"),
        ("aaaaaa", "gibberish"),
        ("hi asdfgh", "gibberish"),
    ],
)
def test_not_a_request(text, reason):
    assert not_a_request(text) == reason


@pytest.mark.parametrize(
    "text",
    [
        "help",
        "pain",
        "I feel weird",
        "pls water",
        "tv",
        "TV not working",
        "strengths",
        "typewriter",
        "mwen bezwen dlo",
        "我要水",
        "पानी चाहिए",
        "hi, can I get water",
    ],
)
def test_anything_that_could_be_a_need_goes_through(text):
    assert not_a_request(text) is None


def test_safety_red_flags_always_count_as_requests():
    assert not_a_request("I can't breathe") is None
    assert not_a_request("chest pain") is None


def _post(client, text, **extra):
    return client.post("/api/requests", json={"room_id": "401", "text": text, **extra})


def test_api_turns_back_gibberish_in_the_patients_language_and_creates_nothing(client):
    r = _post(client, "asdfgh", language_hint="es")
    assert r.status_code == 422
    assert r.json()["detail"] == {
        "code": "not_a_request",
        "reason": "gibberish",
        "message": "Lo siento, no entendí su solicitud. Inténtelo de nuevo o toque un botón.",
    }
    r = _post(client, "hello", input_mode="voice")
    assert r.status_code == 422 and r.json()["detail"]["reason"] == "filler"
    assert client.get("/api/rooms/401/tickets").json() == []


def test_quick_tap_tiles_are_never_turned_back(client):
    r = _post(client, "Water", input_mode="quick_tap", tile="water")
    assert r.status_code == 201
