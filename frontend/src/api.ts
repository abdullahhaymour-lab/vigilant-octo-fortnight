const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export type Room = {
  id: string;
  name: string;
  price_per_hour: number;
  order: number;
};

export type SessionItem = {
  id: string;
  product_id: string;
  product_name: string;
  price: number;
  quantity: number;
  subtotal: number;
  added_at: string;
};

export type Session = {
  id: string;
  room_id: string;
  room_name: string;
  price_per_hour: number;
  started_at: string;
  ended_at: string | null;
  play_cost: number;
  cafeteria_cost: number;
  total_cost: number;
  elapsed_minutes: number;
  status: "active" | "closed";
  items: SessionItem[];
};

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  emoji: string;
};

export type Report = {
  period: string;
  play_revenue: number;
  cafeteria_revenue: number;
  total_revenue: number;
  sessions_count: number;
  cafeteria_sales_count: number;
};

export type CafeteriaSale = {
  id: string;
  items: SessionItem[];
  total: number;
  created_at: string;
};

export const api = {
  listRooms: () => req<Room[]>("/rooms"),
  updateRoom: (id: string, data: Partial<Room>) =>
    req<Room>(`/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  startSession: (roomId: string) =>
    req<Session>(`/rooms/${roomId}/start`, { method: "POST" }),
  activeSessions: () => req<Session[]>("/sessions/active"),
  activeForRoom: (roomId: string) =>
    req<Session | null>(`/rooms/${roomId}/active`),
  stopSession: (sessionId: string) =>
    req<Session>(`/sessions/${sessionId}/stop`, { method: "POST" }),
  addItem: (sessionId: string, product_id: string, quantity: number) =>
    req<Session>(`/sessions/${sessionId}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id, quantity }),
    }),
  removeItem: (sessionId: string, itemId: string) =>
    req<Session>(`/sessions/${sessionId}/items/${itemId}`, { method: "DELETE" }),
  history: () => req<Session[]>("/sessions/history"),
  updateSessionTimes: (sessionId: string, data: { started_at?: string; ended_at?: string }) =>
    req<Session>(`/sessions/${sessionId}/times`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  listProducts: () => req<Product[]>("/products"),
  createProduct: (p: Omit<Product, "id">) =>
    req<Product>("/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id: string, p: Partial<Product>) =>
    req<Product>(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(p),
    }),
  deleteProduct: (id: string) =>
    req<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" }),
  cafeteriaSale: (items: { product_id: string; quantity: number }[]) =>
    req<CafeteriaSale>("/cafeteria/sale", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  listCafeteriaSales: () => req<CafeteriaSale[]>("/cafeteria/sales"),
  report: (period: "today" | "week" | "month" | "year" | "all") =>
    req<Report>(`/reports?period=${period}`),
  roomsReport: (period: "today" | "week" | "month" | "year" | "all") =>
    req<RoomReportItem[]>(`/reports/rooms?period=${period}`),
};

export type RoomReportItem = {
  room_id: string;
  room_name: string;
  sessions_count: number;
  total_minutes: number;
  play_revenue: number;
  cafeteria_revenue: number;
  total_revenue: number;
};

export const COLORS = {
  bg: "#050505",
  surface: "#0A0A0A",
  surface2: "#18181B",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(0,240,255,0.4)",
  primary: "#00F0FF",
  text: "#FFFFFF",
  textMuted: "#A1A1AA",
  textDim: "#71717A",
  success: "#10B981",
  danger: "#F43F5E",
  warning: "#F59E0B",
};

export function formatJD(n: number): string {
  return `${n.toFixed(2)} د.أ`;
}

export function formatTimer(startedIso: string): string {
  const start = new Date(startedIso).getTime();
  const now = Date.now();
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function computeLiveCost(startedIso: string, pricePerHour: number): number {
  const start = new Date(startedIso).getTime();
  const now = Date.now();
  const hours = Math.max(0, (now - start) / 3600000);
  return hours * pricePerHour;
}
