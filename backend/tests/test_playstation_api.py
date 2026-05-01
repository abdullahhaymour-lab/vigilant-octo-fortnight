"""Backend tests for PlayStation Lounge API."""
import os
import time
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://gaming-cafe-admin-1.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ------- Rooms -------
class TestRooms:
    def test_list_rooms_returns_16(self, s):
        r = s.get(f"{API}/rooms", timeout=15)
        assert r.status_code == 200
        rooms = r.json()
        assert isinstance(rooms, list)
        assert len(rooms) == 16
        prices = sorted({rm["price_per_hour"] for rm in rooms})
        assert prices == [2.0, 2.5, 3.0]
        for rm in rooms:
            assert "id" in rm and "name" in rm and "price_per_hour" in rm

    def test_update_room(self, s):
        rooms = s.get(f"{API}/rooms").json()
        rid = rooms[0]["id"]
        original_name = rooms[0]["name"]
        original_price = rooms[0]["price_per_hour"]
        r = s.put(f"{API}/rooms/{rid}", json={"name": "TEST_ROOM", "price_per_hour": 4.0})
        assert r.status_code == 200
        upd = r.json()
        assert upd["name"] == "TEST_ROOM"
        assert upd["price_per_hour"] == 4.0
        # Verify persistence
        rooms2 = s.get(f"{API}/rooms").json()
        match = next(rm for rm in rooms2 if rm["id"] == rid)
        assert match["name"] == "TEST_ROOM"
        # Restore
        s.put(f"{API}/rooms/{rid}", json={"name": original_name, "price_per_hour": original_price})


# ------- Products CRUD -------
class TestProducts:
    created_id = None

    def test_list_products(self, s):
        r = s.get(f"{API}/products")
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_create_product(self, s):
        r = s.post(f"{API}/products", json={
            "name": "TEST_منتج", "price": 1.25, "category": "TEST", "stock": 5, "emoji": "🧪"
        })
        assert r.status_code == 200
        p = r.json()
        assert p["name"] == "TEST_منتج"
        assert p["stock"] == 5
        TestProducts.created_id = p["id"]

    def test_update_product(self, s):
        pid = TestProducts.created_id
        r = s.put(f"{API}/products/{pid}", json={"price": 1.5, "stock": 10})
        assert r.status_code == 200
        assert r.json()["price"] == 1.5
        assert r.json()["stock"] == 10

    def test_delete_product(self, s):
        pid = TestProducts.created_id
        r = s.delete(f"{API}/products/{pid}")
        assert r.status_code == 200
        # Verify deletion
        r2 = s.delete(f"{API}/products/{pid}")
        assert r2.status_code == 404


# ------- Sessions full lifecycle -------
class TestSessionLifecycle:
    session_id = None
    room_id = None
    product_id = None
    item_id = None
    initial_stock = None

    def test_start_session(self, s):
        rooms = s.get(f"{API}/rooms").json()
        # pick last room to avoid colliding with an earlier modified one
        TestSessionLifecycle.room_id = rooms[-1]["id"]
        r = s.post(f"{API}/rooms/{TestSessionLifecycle.room_id}/start")
        assert r.status_code == 200, r.text
        sess = r.json()
        assert sess["status"] == "active"
        assert sess["room_id"] == TestSessionLifecycle.room_id
        TestSessionLifecycle.session_id = sess["id"]

    def test_double_start_returns_400(self, s):
        r = s.post(f"{API}/rooms/{TestSessionLifecycle.room_id}/start")
        assert r.status_code == 400

    def test_get_active_session_with_live_costs(self, s):
        time.sleep(1.5)
        r = s.get(f"{API}/rooms/{TestSessionLifecycle.room_id}/active")
        assert r.status_code == 200
        sess = r.json()
        assert sess is not None
        assert sess["status"] == "active"
        assert "elapsed_minutes" in sess
        assert "play_cost" in sess
        assert "cafeteria_cost" in sess
        assert "total_cost" in sess
        assert sess["play_cost"] >= 0

    def test_add_item_decrements_stock(self, s):
        products = s.get(f"{API}/products").json()
        prod = next(p for p in products if p["stock"] > 2)
        TestSessionLifecycle.product_id = prod["id"]
        TestSessionLifecycle.initial_stock = prod["stock"]
        r = s.post(f"{API}/sessions/{TestSessionLifecycle.session_id}/items",
                   json={"product_id": prod["id"], "quantity": 2})
        assert r.status_code == 200, r.text
        sess = r.json()
        assert len(sess["items"]) == 1
        assert sess["cafeteria_cost"] == round(prod["price"] * 2, 3)
        TestSessionLifecycle.item_id = sess["items"][0]["id"]
        # Verify stock decreased
        prod2 = next(p for p in s.get(f"{API}/products").json() if p["id"] == prod["id"])
        assert prod2["stock"] == TestSessionLifecycle.initial_stock - 2

    def test_remove_item_restores_stock(self, s):
        r = s.delete(f"{API}/sessions/{TestSessionLifecycle.session_id}/items/{TestSessionLifecycle.item_id}")
        assert r.status_code == 200
        sess = r.json()
        assert len(sess["items"]) == 0
        prod2 = next(p for p in s.get(f"{API}/products").json() if p["id"] == TestSessionLifecycle.product_id)
        assert prod2["stock"] == TestSessionLifecycle.initial_stock

    def test_stop_session(self, s):
        r = s.post(f"{API}/sessions/{TestSessionLifecycle.session_id}/stop")
        assert r.status_code == 200
        sess = r.json()
        assert sess["status"] == "closed"
        assert sess["ended_at"] is not None
        # Now active should be None
        r2 = s.get(f"{API}/rooms/{TestSessionLifecycle.room_id}/active")
        assert r2.status_code == 200
        assert r2.json() is None

    def test_history_contains_closed_session(self, s):
        r = s.get(f"{API}/sessions/history")
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestSessionLifecycle.session_id in ids


# ------- Cafeteria standalone -------
class TestCafeteria:
    def test_standalone_sale_decrements_stock(self, s):
        products = s.get(f"{API}/products").json()
        prod = next(p for p in products if p["stock"] > 1)
        before = prod["stock"]
        r = s.post(f"{API}/cafeteria/sale", json={
            "items": [{"product_id": prod["id"], "quantity": 1}]
        })
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["total"] == prod["price"]
        prod2 = next(p for p in s.get(f"{API}/products").json() if p["id"] == prod["id"])
        assert prod2["stock"] == before - 1

    def test_empty_cart_400(self, s):
        r = s.post(f"{API}/cafeteria/sale", json={"items": []})
        assert r.status_code == 400


# ------- Reports -------
class TestReports:
    @pytest.mark.parametrize("period", ["today", "week", "month", "year", "all"])
    def test_report_periods(self, s, period):
        r = s.get(f"{API}/reports", params={"period": period})
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("play_revenue", "cafeteria_revenue", "total_revenue",
                 "sessions_count", "cafeteria_sales_count", "period"):
            assert k in d
        assert d["period"] == period
        assert round(d["play_revenue"] + d["cafeteria_revenue"], 3) == d["total_revenue"]


# ------- New: Rooms report -------
class TestRoomsReport:
    @pytest.mark.parametrize("period", ["today", "week", "month", "year", "all"])
    def test_rooms_report_returns_16_with_required_fields(self, s, period):
        r = s.get(f"{API}/reports/rooms", params={"period": period})
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) == 16
        required = {"room_id", "room_name", "sessions_count",
                    "total_minutes", "play_revenue",
                    "cafeteria_revenue", "total_revenue"}
        for row in rows:
            assert required.issubset(row.keys()), f"missing keys: {required - row.keys()}"
            assert row["sessions_count"] >= 0
            assert row["total_minutes"] >= 0
            assert round(row["play_revenue"] + row["cafeteria_revenue"], 3) == row["total_revenue"]


# ------- New: Edit session times -------
class TestSessionTimesEdit:
    """PUT /api/sessions/{id}/times for both active and closed sessions."""
    room_id = None
    active_session_id = None
    closed_session_id = None

    def test_setup_active_and_closed_sessions(self, s):
        rooms = s.get(f"{API}/rooms").json()
        # Use a room with no active session
        active = s.get(f"{API}/sessions/active").json()
        busy = {a["room_id"] for a in active}
        free = [r for r in rooms if r["id"] not in busy]
        assert len(free) >= 2, "need at least 2 free rooms"
        TestSessionTimesEdit.room_id = free[0]["id"]
        # active session
        r = s.post(f"{API}/rooms/{free[0]['id']}/start")
        assert r.status_code == 200, r.text
        TestSessionTimesEdit.active_session_id = r.json()["id"]
        # closed session
        r2 = s.post(f"{API}/rooms/{free[1]['id']}/start")
        assert r2.status_code == 200, r2.text
        sid = r2.json()["id"]
        r3 = s.post(f"{API}/sessions/{sid}/stop")
        assert r3.status_code == 200, r3.text
        TestSessionTimesEdit.closed_session_id = sid

    def test_edit_active_backdates_start_and_recomputes(self, s):
        sid = TestSessionTimesEdit.active_session_id
        # backdate start by 30 minutes
        from datetime import datetime, timezone, timedelta
        new_start = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        r = s.put(f"{API}/sessions/{sid}/times", json={"started_at": new_start})
        assert r.status_code == 200, r.text
        sess = r.json()
        assert sess["status"] == "active"
        # 30 min @ price/hour. price 2.0 → ~1.0; allow 28-32 min window
        assert 28 <= sess["elapsed_minutes"] <= 32
        assert sess["play_cost"] > 0
        assert round(sess["play_cost"] + sess["cafeteria_cost"], 3) == sess["total_cost"]

    def test_edit_closed_session_recomputes(self, s):
        sid = TestSessionTimesEdit.closed_session_id
        from datetime import datetime, timezone, timedelta
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=2)
        r = s.put(f"{API}/sessions/{sid}/times", json={
            "started_at": start.isoformat(),
            "ended_at": end.isoformat(),
        })
        assert r.status_code == 200, r.text
        sess = r.json()
        assert sess["status"] == "closed"
        assert 119 <= sess["elapsed_minutes"] <= 121
        # price 2.0/hour → 4.0
        assert sess["play_cost"] > 0

    def test_invalid_datetime_returns_400(self, s):
        sid = TestSessionTimesEdit.active_session_id
        r = s.put(f"{API}/sessions/{sid}/times", json={"started_at": "not-a-date"})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_session_not_found_returns_404(self, s):
        r = s.put(f"{API}/sessions/nonexistent-id/times",
                  json={"started_at": "2026-01-01T00:00:00+00:00"})
        assert r.status_code == 404

    def test_cleanup(self, s):
        if TestSessionTimesEdit.active_session_id:
            s.post(f"{API}/sessions/{TestSessionTimesEdit.active_session_id}/stop")
