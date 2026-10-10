from fastapi.testclient import TestClient


def token(client, dept):
    return client.post("/api/auth/login", json={"department": dept, "pin": "2468"}).json()["token"]


def subscribe(ws, channels, tok=None):
    ws.send_json({"action": "subscribe", "channels": channels, "token": tok})
    return ws.receive_json()


def test_pillow_event_reaches_housekeeping_and_room_not_nursing(app):
    with TestClient(app) as client:
        hk, nurse = token(client, "housekeeping"), token(client, "nursing")
        with (
            client.websocket_connect("/ws") as ws_hk,
            client.websocket_connect("/ws") as ws_nurse,
            client.websocket_connect("/ws") as ws_room,
        ):
            assert subscribe(ws_hk, ["dept:housekeeping"], hk)["type"] == "subscribed"
            assert subscribe(ws_nurse, ["dept:nursing"], nurse)["type"] == "subscribed"
            assert subscribe(ws_room, ["room:401"])["type"] == "subscribed"

            client.post("/api/requests", json={"room_id": "401", "text": "extra pillow please"})
            event = ws_hk.receive_json()
            assert event["type"] == "ticket.created"
            assert event["ticket"]["department"] == "housekeeping"
            assert ws_room.receive_json()["ticket"]["ticket_id"] == event["ticket"]["ticket_id"]

            # Nursing receives nothing: ping/pong proves the queue is empty.
            ws_nurse.send_json({"action": "ping"})
            assert ws_nurse.receive_json() == {"type": "pong"}

            # Escalation is delivered to nursing and to the original department.
            r = client.patch(
                f"/api/tickets/{event['ticket']['ticket_id']}",
                json={"action": "escalate_to_nurse"},
                headers={"Authorization": f"Bearer {hk}"},
            )
            assert r.status_code == 200
            esc = ws_nurse.receive_json()
            assert esc["type"] == "ticket.escalated" and esc["ticket"]["department"] == "nursing"
            assert ws_hk.receive_json()["type"] == "ticket.escalated"


def test_department_channels_require_matching_staff_token(app):
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        assert subscribe(ws, ["dept:nursing"])["type"] == "error"
        assert subscribe(ws, ["dept:nursing"], token(client, "food"))["type"] == "error"
        assert subscribe(ws, ["dept:spa"], token(client, "food"))["type"] == "error"
        assert subscribe(ws, ["room:401; DROP"])["type"] == "error"
        assert subscribe(ws, "room:401")["type"] == "error"
        ws.send_text("not json")
        assert ws.receive_json()["type"] == "error"


def test_room_channel_gets_only_the_patient_view(app):
    """room:* needs no login, so it must never carry patient words, audit or safety reasons."""
    from app.models import PatientTicketView

    with TestClient(app) as client:
        nurse = token(client, "nursing")
        with (
            client.websocket_connect("/ws") as ws_nurse,
            client.websocket_connect("/ws") as ws_room,
            client.websocket_connect("/ws") as ws_both,
        ):
            subscribe(ws_nurse, ["dept:nursing"], nurse)
            subscribe(ws_room, ["room:401"])
            subscribe(ws_both, ["dept:nursing", "room:401"], nurse)

            client.post("/api/requests", json={"room_id": "401", "text": "I'm bleeding badly"})
            staff = ws_nurse.receive_json()["ticket"]
            room = ws_room.receive_json()["ticket"]

            assert staff["original_text"] == "I'm bleeding badly" and staff["audit"]
            assert set(room) == set(PatientTicketView.model_fields)
            for hidden in ("original_text", "english_summary", "audit", "safety_reasons", "notes"):
                assert hidden not in room
            assert "bleeding" not in str(room).lower()

            # A staff socket that also watches the room gets exactly one message, the full one.
            both = ws_both.receive_json()["ticket"]
            assert both["original_text"] == "I'm bleeding badly"
            ws_both.send_json({"action": "ping"})
            assert ws_both.receive_json() == {"type": "pong"}
