from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ========== Models ==========
class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price_per_hour: float
    order: int = 0


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    price_per_hour: Optional[float] = None


class SessionItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    product_name: str
    price: float
    quantity: int
    subtotal: float
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_id: str
    room_name: str
    price_per_hour: float
    started_at: str
    ended_at: Optional[str] = None
    play_cost: float = 0.0
    cafeteria_cost: float = 0.0
    total_cost: float = 0.0
    elapsed_minutes: int = 0
    status: Literal["active", "closed"] = "active"
    items: List[SessionItem] = []


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    category: str = "عام"
    stock: int = 0
    emoji: str = "🥤"


class ProductCreate(BaseModel):
    name: str
    price: float
    category: str = "عام"
    stock: int = 0
    emoji: str = "🥤"


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    stock: Optional[int] = None
    emoji: Optional[str] = None


class AddItemRequest(BaseModel):
    product_id: str
    quantity: int = 1


class CafeteriaSaleItem(BaseModel):
    product_id: str
    quantity: int = 1


class CafeteriaSaleRequest(BaseModel):
    items: List[CafeteriaSaleItem]


class CafeteriaSale(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    items: List[SessionItem]
    total: float
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ========== Helpers ==========
def compute_play_cost(started_at_iso: str, price_per_hour: float, ended_at_iso: Optional[str] = None) -> tuple:
    start = datetime.fromisoformat(started_at_iso)
    end = datetime.fromisoformat(ended_at_iso) if ended_at_iso else datetime.now(timezone.utc)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    delta = end - start
    minutes = max(0, int(delta.total_seconds() // 60))
    cost = round((delta.total_seconds() / 3600.0) * price_per_hour, 3)
    return minutes, cost


async def seed_rooms():
    count = await db.rooms.count_documents({})
    if count == 0:
        defaults = []
        # 16 rooms with varying prices
        for i in range(1, 17):
            # Mix of prices: 2, 2.5, 3 JD
            if i <= 8:
                price = 2.0
            elif i <= 12:
                price = 2.5
            else:
                price = 3.0
            defaults.append(Room(name=f"غرفة {i}", price_per_hour=price, order=i).dict())
        await db.rooms.insert_many(defaults)


async def seed_products():
    count = await db.products.count_documents({})
    if count == 0:
        defaults = [
            Product(name="بيبسي", price=0.5, category="مشروبات", stock=50, emoji="🥤"),
            Product(name="كوكا كولا", price=0.5, category="مشروبات", stock=50, emoji="🥤"),
            Product(name="ريد بُل", price=1.5, category="مشروبات الطاقة", stock=30, emoji="⚡"),
            Product(name="ماء", price=0.25, category="مشروبات", stock=100, emoji="💧"),
            Product(name="قهوة", price=0.75, category="مشروبات ساخنة", stock=40, emoji="☕"),
            Product(name="شاي", price=0.5, category="مشروبات ساخنة", stock=40, emoji="🍵"),
            Product(name="شيبس", price=0.5, category="سناكس", stock=60, emoji="🍟"),
            Product(name="شوكولاتة", price=0.75, category="سناكس", stock=50, emoji="🍫"),
            Product(name="بسكويت", price=0.5, category="سناكس", stock=40, emoji="🍪"),
            Product(name="سندويش", price=2.0, category="طعام", stock=20, emoji="🥪"),
        ]
        await db.products.insert_many([p.dict() for p in defaults])


# ========== Rooms ==========
@api_router.get("/rooms", response_model=List[Room])
async def list_rooms():
    rooms = await db.rooms.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return [Room(**r) for r in rooms]


@api_router.put("/rooms/{room_id}", response_model=Room)
async def update_room(room_id: str, update: RoomUpdate):
    payload = {k: v for k, v in update.dict().items() if v is not None}
    if not payload:
        raise HTTPException(400, "لا يوجد تحديثات")
    await db.rooms.update_one({"id": room_id}, {"$set": payload})
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(404, "الغرفة غير موجودة")
    return Room(**room)


# ========== Sessions ==========
@api_router.post("/rooms/{room_id}/start", response_model=Session)
async def start_session(room_id: str):
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(404, "الغرفة غير موجودة")
    existing = await db.sessions.find_one({"room_id": room_id, "status": "active"}, {"_id": 0})
    if existing:
        raise HTTPException(400, "الغرفة مشغولة بالفعل")
    sess = Session(
        room_id=room_id,
        room_name=room["name"],
        price_per_hour=room["price_per_hour"],
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    await db.sessions.insert_one(sess.dict())
    return sess


@api_router.get("/rooms/{room_id}/active", response_model=Optional[Session])
async def get_active_session(room_id: str):
    sess = await db.sessions.find_one({"room_id": room_id, "status": "active"}, {"_id": 0})
    if not sess:
        return None
    minutes, play_cost = compute_play_cost(sess["started_at"], sess["price_per_hour"])
    cafe = sum(i["subtotal"] for i in sess.get("items", []))
    sess["elapsed_minutes"] = minutes
    sess["play_cost"] = round(play_cost, 3)
    sess["cafeteria_cost"] = round(cafe, 3)
    sess["total_cost"] = round(play_cost + cafe, 3)
    return Session(**sess)


@api_router.get("/sessions/active", response_model=List[Session])
async def list_active_sessions():
    sessions = await db.sessions.find({"status": "active"}, {"_id": 0}).to_list(100)
    out = []
    for sess in sessions:
        minutes, play_cost = compute_play_cost(sess["started_at"], sess["price_per_hour"])
        cafe = sum(i["subtotal"] for i in sess.get("items", []))
        sess["elapsed_minutes"] = minutes
        sess["play_cost"] = round(play_cost, 3)
        sess["cafeteria_cost"] = round(cafe, 3)
        sess["total_cost"] = round(play_cost + cafe, 3)
        out.append(Session(**sess))
    return out


@api_router.post("/sessions/{session_id}/stop", response_model=Session)
async def stop_session(session_id: str):
    sess = await db.sessions.find_one({"id": session_id, "status": "active"}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "الجلسة غير موجودة")
    ended = datetime.now(timezone.utc).isoformat()
    minutes, play_cost = compute_play_cost(sess["started_at"], sess["price_per_hour"], ended)
    cafe = sum(i["subtotal"] for i in sess.get("items", []))
    total = round(play_cost + cafe, 3)
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {
            "ended_at": ended,
            "elapsed_minutes": minutes,
            "play_cost": round(play_cost, 3),
            "cafeteria_cost": round(cafe, 3),
            "total_cost": total,
            "status": "closed",
        }}
    )
    sess = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    return Session(**sess)


@api_router.post("/sessions/{session_id}/items", response_model=Session)
async def add_session_item(session_id: str, req: AddItemRequest):
    sess = await db.sessions.find_one({"id": session_id, "status": "active"}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "الجلسة غير موجودة أو مغلقة")
    product = await db.products.find_one({"id": req.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "المنتج غير موجود")
    if product.get("stock", 0) < req.quantity:
        raise HTTPException(400, "المخزون غير كافٍ")
    item = SessionItem(
        product_id=product["id"],
        product_name=product["name"],
        price=product["price"],
        quantity=req.quantity,
        subtotal=round(product["price"] * req.quantity, 3),
    )
    await db.sessions.update_one(
        {"id": session_id},
        {"$push": {"items": item.dict()}}
    )
    await db.products.update_one(
        {"id": req.product_id},
        {"$inc": {"stock": -req.quantity}}
    )
    sess = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    minutes, play_cost = compute_play_cost(sess["started_at"], sess["price_per_hour"])
    cafe = sum(i["subtotal"] for i in sess.get("items", []))
    sess["elapsed_minutes"] = minutes
    sess["play_cost"] = round(play_cost, 3)
    sess["cafeteria_cost"] = round(cafe, 3)
    sess["total_cost"] = round(play_cost + cafe, 3)
    return Session(**sess)


@api_router.delete("/sessions/{session_id}/items/{item_id}", response_model=Session)
async def remove_session_item(session_id: str, item_id: str):
    sess = await db.sessions.find_one({"id": session_id, "status": "active"}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "الجلسة غير موجودة")
    item = next((i for i in sess.get("items", []) if i["id"] == item_id), None)
    if not item:
        raise HTTPException(404, "العنصر غير موجود")
    await db.sessions.update_one(
        {"id": session_id},
        {"$pull": {"items": {"id": item_id}}}
    )
    await db.products.update_one(
        {"id": item["product_id"]},
        {"$inc": {"stock": item["quantity"]}}
    )
    sess = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    minutes, play_cost = compute_play_cost(sess["started_at"], sess["price_per_hour"])
    cafe = sum(i["subtotal"] for i in sess.get("items", []))
    sess["elapsed_minutes"] = minutes
    sess["play_cost"] = round(play_cost, 3)
    sess["cafeteria_cost"] = round(cafe, 3)
    sess["total_cost"] = round(play_cost + cafe, 3)
    return Session(**sess)


@api_router.get("/sessions/history", response_model=List[Session])
async def session_history(limit: int = 100):
    sessions = await db.sessions.find(
        {"status": "closed"}, {"_id": 0}
    ).sort("ended_at", -1).to_list(limit)
    return [Session(**s) for s in sessions]


# ========== Products ==========
@api_router.get("/products", response_model=List[Product])
async def list_products():
    products = await db.products.find({}, {"_id": 0}).to_list(500)
    return [Product(**p) for p in products]


@api_router.post("/products", response_model=Product)
async def create_product(p: ProductCreate):
    product = Product(**p.dict())
    await db.products.insert_one(product.dict())
    return product


@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, update: ProductUpdate):
    payload = {k: v for k, v in update.dict().items() if v is not None}
    if not payload:
        raise HTTPException(400, "لا يوجد تحديثات")
    await db.products.update_one({"id": product_id}, {"$set": payload})
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "المنتج غير موجود")
    return Product(**product)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    res = await db.products.delete_one({"id": product_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "المنتج غير موجود")
    return {"ok": True}


# ========== Cafeteria standalone sale ==========
@api_router.post("/cafeteria/sale", response_model=CafeteriaSale)
async def create_cafeteria_sale(req: CafeteriaSaleRequest):
    if not req.items:
        raise HTTPException(400, "السلة فارغة")
    items: List[SessionItem] = []
    total = 0.0
    for it in req.items:
        product = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(404, f"منتج غير موجود: {it.product_id}")
        if product.get("stock", 0) < it.quantity:
            raise HTTPException(400, f"مخزون غير كافٍ: {product['name']}")
        subtotal = round(product["price"] * it.quantity, 3)
        items.append(SessionItem(
            product_id=product["id"],
            product_name=product["name"],
            price=product["price"],
            quantity=it.quantity,
            subtotal=subtotal,
        ))
        total += subtotal
        await db.products.update_one(
            {"id": it.product_id},
            {"$inc": {"stock": -it.quantity}}
        )
    sale = CafeteriaSale(items=items, total=round(total, 3))
    await db.cafeteria_sales.insert_one(sale.dict())
    return sale


@api_router.get("/cafeteria/sales", response_model=List[CafeteriaSale])
async def list_cafeteria_sales(limit: int = 100):
    sales = await db.cafeteria_sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [CafeteriaSale(**s) for s in sales]


# ========== Reports ==========
class ReportResponse(BaseModel):
    period: str
    play_revenue: float
    cafeteria_revenue: float
    total_revenue: float
    sessions_count: int
    cafeteria_sales_count: int


@api_router.get("/reports", response_model=ReportResponse)
async def get_report(period: Literal["today", "week", "month", "all"] = "today"):
    now = datetime.now(timezone.utc)
    if period == "today":
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_dt = now - timedelta(days=7)
    elif period == "month":
        start_dt = now - timedelta(days=30)
    else:
        start_dt = datetime.fromtimestamp(0, tz=timezone.utc)

    start_iso = start_dt.isoformat()

    # closed sessions in period
    closed = await db.sessions.find(
        {"status": "closed", "ended_at": {"$gte": start_iso}},
        {"_id": 0}
    ).to_list(10000)
    play_rev = sum(s.get("play_cost", 0) for s in closed)
    cafe_from_sessions = sum(s.get("cafeteria_cost", 0) for s in closed)

    # standalone cafeteria sales in period
    sales = await db.cafeteria_sales.find(
        {"created_at": {"$gte": start_iso}}, {"_id": 0}
    ).to_list(10000)
    cafe_standalone = sum(s.get("total", 0) for s in sales)

    cafe_rev = round(cafe_from_sessions + cafe_standalone, 3)
    play_rev = round(play_rev, 3)
    return ReportResponse(
        period=period,
        play_revenue=play_rev,
        cafeteria_revenue=cafe_rev,
        total_revenue=round(play_rev + cafe_rev, 3),
        sessions_count=len(closed),
        cafeteria_sales_count=len(sales),
    )


@api_router.get("/")
async def root():
    return {"message": "PlayStation Lounge Management API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await seed_rooms()
    await seed_products()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
