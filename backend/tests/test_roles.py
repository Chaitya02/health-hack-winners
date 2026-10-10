"""C4 (US-3): role-carrying tokens, admin login, and what each role may see or do."""

import pytest

from app.models import LOGIN_ROLES, ROLE_DEPARTMENT, STAFF_ROLE, Department, Role
from app.realtime.channels import authorize_channels
from tests.test_api import submit


def login_as(client, pin="2468", **who) -> dict:
    r = client.post("/api/auth/login", json={**who, "pin": pin})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def admin(client) -> dict:
    return login_as(client, pin="1357", role="admin")


def test_role_maps_are_consistent():
    assert set(STAFF_ROLE) == set(Department)
    assert {ROLE_DEPARTMENT[r] for r in STAFF_ROLE.values()} == set(Department)
    assert {*STAFF_ROLE.values(), Role.ADMIN} == LOGIN_ROLES
    assert Role.PATIENT not in LOGIN_ROLES and Role.SYSTEM not in LOGIN_ROLES


@pytest.mark.parametrize(
    ("who", "role", "department"),
    [
        ({"department": "nursing"}, "nurse", "nursing"),
        ({"role": "nurse"}, "nurse", "nursing"),
        ({"role": "food"}, "food", "food"),
    ],
)
def test_staff_login_by_department_or_role(client, who, role, department):
    r = client.post("/api/auth/login", json={**who, "pin": "2468"}).json()
    assert (r["role"], r["department"]) == (role, department)


def test_admin_has_its_own_pin(client):
    assert client.post("/api/auth/login", json={"role": "admin", "pin": "2468"}).status_code == 401
    r = client.post("/api/auth/login", json={"role": "admin", "pin": "1357"}).json()
    assert (r["role"], r["department"]) == ("admin", None)


@pytest.mark.parametrize(
    "body",
    [
        {"role": "patient", "pin": "2468"},
        {"role": "system", "pin": "2468"},
        {"role": "nurse", "department": "nursing", "pin": "2468"},
        {"pin": "2468"},
    ],
)
def test_login_rejects_non_login_roles_and_ambiguous_bodies(client, body):
    assert client.post("/api/auth/login", json=body).status_code in (401, 422)


def test_metrics_need_a_signed_in_staff_or_admin(client):
    assert client.get("/api/metrics").status_code == 401
    assert client.get("/api/metrics", headers=admin(client)).status_code == 200
    assert client.get("/api/metrics", headers=login_as(client, role="it")).status_code == 200


def test_admin_cannot_work_department_queues(client):
    t = submit(client, "extra pillow please")["tickets"][0]
    h = admin(client)
    assert client.get("/api/queues/housekeeping", headers=h).status_code == 403
    r = client.patch(f"/api/tickets/{t['ticket_id']}", json={"action": "resolve"}, headers=h)
    assert r.status_code == 403


def test_staff_only_see_and_act_on_their_own_department(client):
    t = submit(client, "extra pillow please")["tickets"][0]
    food = login_as(client, role="food")
    assert client.get("/api/queues/housekeeping", headers=food).status_code == 403
    r = client.patch(f"/api/tickets/{t['ticket_id']}", json={"action": "resolve"}, headers=food)
    assert r.status_code == 403
    nurse = login_as(client, role="nurse")
    r = client.patch(f"/api/tickets/{t['ticket_id']}", json={"action": "resolve"}, headers=nurse)
    assert r.status_code == 403


def test_history_records_the_acting_role(client):
    t = submit(client, "chest pain")["tickets"][0]
    r = client.patch(
        f"/api/tickets/{t['ticket_id']}",
        json={"action": "acknowledge"},
        headers=login_as(client, role="nurse"),
    ).json()
    assert r["history"][-1]["by_role"] == "nurse"


def test_old_department_tokens_and_tampering_are_rejected(app):
    auth = app.state.auth
    token = auth.login(Role.NURSE, "2468")
    assert auth.verify(token) == Role.NURSE
    _role, exp, sig = token.rsplit(".", 2)
    assert auth.verify(f"admin.{exp}.{sig}") is None
    # Pre-C4 tokens carried the department name; "nursing" is not a role.
    assert auth.verify(f"nursing.{exp}.{auth._sign(f'nursing.{exp}')}") is None


def test_websocket_department_channels_follow_the_role(app):
    auth = app.state.auth
    nurse, admin_token = auth.login(Role.NURSE, "2468"), auth.login(Role.ADMIN, "1357")
    assert authorize_channels(["dept:nursing"], nurse, auth) == (["dept:nursing"], None)
    assert authorize_channels(["dept:food"], nurse, auth)[1]
    assert authorize_channels(["dept:nursing"], admin_token, auth)[1]
    assert authorize_channels(["room:401"], None, auth) == (["room:401"], None)
