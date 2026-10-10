import pytest

from app.models import Language, Room


def login(client, dept="housekeeping", pin="2468") -> dict:
    r = client.post("/api/auth/login", json={"department": dept, "pin": pin})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def submit(client, text, room="401", **extra):
    r = client.post("/api/requests", json={"room_id": room, "text": text, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_pillow_goes_to_housekeeping_not_nursing(client):
    body = submit(client, "extra pillow please")
    assert [t["department"] for t in body["tickets"]] == ["housekeeping"]
    assert body["is_clinical"] is False
    assert body["confirmation"] == "Housekeeping is on the way."

    hk = client.get("/api/queues/housekeeping", headers=login(client, "housekeeping")).json()
    nurse = client.get("/api/queues/nursing", headers=login(client, "nursing")).json()
    assert len(hk) == 1 and nurse == []


def test_urgent_goes_to_nursing_high(client):
    body = submit(client, "My surgical incision is throbbing and I feel dizzy.")
    (t,) = body["tickets"]
    assert (t["department"], t["priority"], t["category"]) == ("nursing", "HIGH", "URGENT_CLINICAL")
    assert t["clinical_risk_flag"] is True
    assert "red_flag:pre:wound" in t["safety_reasons"]
    assert body["confirmation"].startswith("Your nurse has been alerted")
    audit = t["audit"]
    assert audit["rules_pre"] and audit["final_decision"]["department"] == "nursing"
    assert t["model_id"] and t["prompt_version"] and t["latency_ms"] >= 0


def test_spanish_ice_water_goes_to_food_with_spanish_confirmation(client):
    body = submit(client, "¿Me puede traer agua con hielo?")
    assert [t["department"] for t in body["tickets"]] == ["food"]
    assert body["confirmation_language"] == "es"
    assert body["confirmation"] == "Servicios de alimentación va en camino."


def test_multi_intent_creates_one_ticket_per_department(client):
    body = submit(client, "I need water and my IV is beeping")
    assert sorted(t["department"] for t in body["tickets"]) == ["food", "nursing"]
    assert len({t["request_id"] for t in body["tickets"]}) == 1


def test_quick_tap_tiles_are_deterministic(client):
    body = submit(client, "Pillow", input_mode="quick_tap", tile="pillow", language_hint="pt")
    (t,) = body["tickets"]
    assert t["department"] == "housekeeping" and t["model_id"] == "quick_tap"
    assert body["confirmation"] == "A equipe de limpeza está a caminho."
    nurse = submit(client, "I need my nurse", input_mode="quick_tap", tile="nurse")["tickets"][0]
    assert (nurse["department"], nurse["priority"]) == ("nursing", "HIGH")


def test_unknown_tile_falls_back_to_classifier(client):
    body = submit(client, "extra pillow please", input_mode="quick_tap", tile="spaceship")
    assert body["tickets"][0]["department"] == "housekeeping"


@pytest.mark.parametrize(
    "payload",
    [
        {"room_id": "401", "text": "x" * 501},
        {"room_id": "401", "text": ""},
        {"room_id": "401", "text": "   "},
        {"room_id": "../etc", "text": "hi"},
        {"room_id": "401", "text": "hi", "input_mode": "telepathy"},
    ],
)
def test_input_validation(client, payload):
    r = client.post("/api/requests", json=payload)
    assert r.status_code == 422
    assert "xxxx" not in r.text  # never echo patient text back


def test_unknown_room_404(client):
    assert client.post("/api/requests", json={"room_id": "999", "text": "hi"}).status_code == 404
    assert client.get("/api/rooms/999").status_code == 404


def test_rate_limit_per_room(app, client):
    app.state.rate_limiter.limit = 3
    codes = [
        client.post("/api/requests", json={"room_id": "401", "text": "water"}).status_code
        for _ in range(4)
    ]
    assert codes == [201, 201, 201, 429]
    app.state.rooms.put(
        Room(
            room_id="402",
            unit="4W",
            patient_alias="Sam",
            preferred_language=Language.EN,
            primary_nurse="N",
        )
    )
    assert client.post("/api/requests", json={"room_id": "402", "text": "water"}).status_code == 201


def test_staff_endpoints_require_valid_token(client):
    assert client.get("/api/queues/nursing").status_code == 401
    assert (
        client.get("/api/queues/nursing", headers={"Authorization": "Bearer junk"}).status_code
        == 401
    )
    assert (
        client.post("/api/auth/login", json={"department": "nursing", "pin": "0000"}).status_code
        == 401
    )
    hk = login(client, "housekeeping")
    assert client.get("/api/queues/nursing", headers=hk).status_code == 403


def test_ticket_lifecycle_and_timestamps(client):
    t = submit(client, "extra pillow please")["tickets"][0]
    hk = login(client)
    url = f"/api/tickets/{t['ticket_id']}"
    r = client.patch(url, json={"action": "acknowledge"}, headers=hk).json()
    assert r["status"] == "ACKNOWLEDGED" and r["acknowledged_at"]
    assert client.patch(url, json={"action": "acknowledge"}, headers=hk).status_code == 409
    assert client.patch(url, json={"action": "start"}, headers=hk).json()["status"] == "IN_PROGRESS"
    r = client.patch(url, json={"action": "resolve"}, headers=hk).json()
    assert r["status"] == "RESOLVED" and r["resolved_at"]
    assert client.patch(url, json={"action": "start"}, headers=hk).status_code == 409


def test_staff_escalation_moves_ticket_to_nursing(client):
    t = submit(client, "the bed is wet and there's water on the floor")["tickets"]
    hk_ticket = next(x for x in t if x["department"] == "housekeeping")
    r = client.patch(
        f"/api/tickets/{hk_ticket['ticket_id']}",
        json={"action": "escalate_to_nurse"},
        headers=login(client),
    ).json()
    assert (r["department"], r["status"], r["priority"]) == ("nursing", "ESCALATED", "HIGH")
    assert r["escalated_from"] == "housekeeping"
    assert "staff_escalation" in r["safety_reasons"]
    nursing = client.get("/api/queues/nursing", headers=login(client, "nursing")).json()
    assert hk_ticket["ticket_id"] in [x["ticket_id"] for x in nursing]
    # Housekeeping can no longer act on it.
    assert (
        client.patch(
            f"/api/tickets/{hk_ticket['ticket_id']}",
            json={"action": "resolve"},
            headers=login(client),
        ).status_code
        == 403
    )


def test_room_tickets_patient_view_hides_internals(client):
    submit(client, "extra pillow please")
    rows = client.get("/api/rooms/401/tickets").json()
    assert len(rows) == 1
    assert "audit" not in rows[0] and "original_text" not in rows[0]


def test_metrics(client):
    submit(client, "extra pillow please")
    submit(client, "¿Me puede traer agua con hielo?")
    submit(client, "I'm bleeding")
    m = client.get("/api/metrics", headers=login(client)).json()
    assert m["total"] == 3
    assert m["diverted_from_nursing"] == 2
    assert m["diverted_pct"] == pytest.approx(66.7)
    assert m["urgent_count"] == 1


def test_dry_run_classify_requires_staff_and_creates_nothing(client):
    assert client.post("/api/classify", json={"text": "pillow"}).status_code == 401
    r = client.post(
        "/api/classify", json={"text": "I'm bleeding"}, headers=login(client, "nursing")
    ).json()
    assert r["departments"] == ["nursing"] and r["is_clinical"] is True
    assert client.get("/api/metrics", headers=login(client)).json()["total"] == 0
