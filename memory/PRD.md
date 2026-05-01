# PRD - PlayStation Lounge Management App

## Overview
تطبيق موبايل عربي (RTL) لإدارة محل بلايستيشن مع 16 غرفة ومبيعات كافتيريا مستقلة بعملة الدينار الأردني (د.أ).

## Features
- **لوحة التحكم**: 16 غرفة مع مؤقتات مباشرة، إحصائيات يومية (بلايستيشن / كافتيريا / إجمالي)
- **إدارة الجلسات**:
  - بدء/إيقاف بضغطة زر + حساب تلقائي للتكلفة بالدقيقة
  - إضافة طلبات كافتيريا للفاتورة
  - **أزرار سريعة لإرجاع وقت البداية** (-5، -15، -30 دقيقة، -1 ساعة)
  - **تعديل يدوي لوقت البداية والنهاية** لأي جلسة (نشطة أو منتهية) مع إعادة حساب تلقائية
- **الكافتيريا**: نقطة بيع مستقلة مع سلة وتأكيد بيع وتتبع المخزون
- **المنتجات**: إضافة/تعديل/حذف المنتجات مع فئات وأيقونات emoji
- **التقارير**:
  - فترات: يومي / أسبوعي / شهري / **سنوي** / الكل
  - 3 تبويبات: ملخص، **حسب الغرفة** (تقرير مفصّل لكل غرفة بعدد الجلسات والدقائق والإيرادات)، السجل
  - تعديل الأوقات من سجل الجلسات
- **الإعدادات**: تعديل اسم وسعر كل غرفة

## Tech Stack
- Frontend: Expo Router (tabs) + React Native + I18nManager RTL
- Backend: FastAPI + MongoDB (motor)
- تصميم داكن احترافي مع لمسات سماوية نيون (#00F0FF)

## Seeded Data
- 16 غرفة (8 × 2 د.أ، 4 × 2.5 د.أ، 4 × 3 د.أ)
- 10 منتجات (مشروبات، سناكس، طعام)

## API Endpoints
- `/api/rooms` GET, PUT `/api/rooms/{id}`
- `/api/rooms/{id}/start`, `/api/rooms/{id}/active`, `/api/sessions/active`
- `/api/sessions/{id}/stop`, `/api/sessions/{id}/items` (POST/DELETE)
- `/api/sessions/{id}/times` PUT — تعديل وقت البداية/النهاية
- `/api/sessions/history`
- `/api/products` CRUD
- `/api/cafeteria/sale` POST, `/api/cafeteria/sales` GET
- `/api/reports?period=today|week|month|year|all`
- `/api/reports/rooms?period=...` — تقرير مفصّل لكل غرفة

## Tests
- Backend: 31/31 pytest passing
- Frontend: 5/5 screens render cleanly with all testIDs

## No External Integrations, No Authentication.
