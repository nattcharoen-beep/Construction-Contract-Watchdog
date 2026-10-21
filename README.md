# 🏗️ Construction Contract Watchdog

> **ระบบติดตามสัญญาและงวดงานก่อสร้าง แจ้งเตือนผ่าน LINE อัตโนมัติ**  
> สถาปัตยกรรม Edge Serverless (Cloudflare Workers + D1 SQLite + Cloudflare Assets + LINE Messaging API + LINE LIFF)

---

## 📌 ภาพรวมโครงการ (Overview)

**Construction Contract Watchdog** ถูกออกแบบขึ้นมาเพื่อแก้ปัญหาคลาสสิกของผู้รับเหมาและผู้บริหารโครงการก่อสร้าง/งานประมูลภาครัฐ (B2G):
1. **ป้องกันค่าปรับสัญญา (Daily Fine Prevention):** ตรวจจับวันสิ้นสุดสัญญาทั้งตามสัญญาเดิมและสัญญาที่มีการขยายเวลา (Time Extensions) คำนวณค่าปรับรายวันและค่าปรับสะสมแบบเรียลไทม์
2. **รายงานสรุปยามเช้าอัตโนมัติ (Morning Digest at 07:00 ICT):** ระบบตั้ง Cron ยิงสรุปสถานะสัญญาเข้า LINE ผู้บริหารและกลุ่มหน้างานทุกเช้า
3. **ติดตามงวดงานและการตรวจรับ (Milestone & Inspection Tracking):** แจ้งเตือนงวดงานที่ใกล้ครบกำหนดส่ง และตรวจจับงวดงานที่ยื่นส่งมอบไปแล้วแต่ยังรอผลตรวจรับจากคณะกรรมการ (>= 5 วัน)
4. **บริหารจัดการเอกสารเข้า-ออก (Letter & Extension Tracking):** บันทึกหนังสือขอขยายเวลา, หนังสือขออนุมัติวัสดุ, และการงดลดค่าปรับ

---

## 🏛️ สถาปัตยกรรมระบบ (Architecture)

```
                       +----------------------------------+
                       |   LINE App (User / Field Group)  |
                       +-----------------+----------------+
                                         |
                       Webhook & Push    |  LINE LIFF Webview
                                         v
+-------------------------------------------------------------------------+
| Cloudflare Workers Edge Platform                                        |
|                                                                         |
|  +--------------------+     +----------------------------------------+  |
|  | Cron Trigger       |     | Hono API Router (src/worker.js)        |  |
|  | Every day 00:00 UTC|     | - GET /api/projects                    |  |
|  | (07:00 ICT)        | --> | - POST /api/projects/:id/extensions    |  |
|  +--------------------+     | - POST /api/line/webhook               |  |
|                             +-------------------+--------------------+  |
|                                                 |                       |
|  +--------------------+     +-------------------+--------------------+  |
|  | Cloudflare Assets  |     | Cloudflare D1 (SQLite Edge Database)   |  |
|  | (./public)         |     | - projects, contract_extensions        |  |
|  | Web App Dashboard  |     | - milestones, documents, line_recips   |  |
|  +--------------------+     +----------------------------------------+  |
+-------------------------------------------------------------------------+
```

- **Runtime / API:** [Cloudflare Workers](https://workers.cloudflare.com/) ขับเคลื่อนด้วย [Hono.js](https://hono.dev/)
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) Serverless SQL Database ที่ขอบ Edge
- **Frontend / LIFF:** Static Assets Hosting (`./public`) รองรับ Responsive Web และ LINE LIFF
- **Automation:** Cloudflare Scheduled Cron Triggers
- **Messaging:** LINE Messaging API (Push / Reply / Webhook)

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
Construction-Contract-Watchdog/
├── .env.example            # ตัวอย่างตัวแปรสภาพแวดล้อม
├── package.json            # รายการ Dependencies และ Scripts
├── README.md               # คู่มือการติดตั้งและใช้งาน
├── wrangler.toml           # การตั้งค่า Cloudflare Workers, Assets, D1 และ Cron
├── public/                 # เว็บ Dashboard และ LINE LIFF Frontend
├── src/
│   ├── worker.js           # Hono API Router, Endpoints, และ Cron Scheduled Task
│   ├── logic.js            # Business Logic, Metrics Calculation, Thai Date, และ Digest Builder
│   ├── line.js             # LINE Messaging API Client, WebCrypto Signature & Webhook
│   └── db/
│       └── schema.sql      # โครงสร้างฐานข้อมูล D1 SQLite (Projects, Extensions, Milestones, Docs)
└── tests/
    └── verify.js           # Verification Test Suite ตรวจสอบความถูกต้อง 100%
```

---

## 🧮 กฎการคำนวณและระดับความเร่งด่วน (Business Logic Engine)

| สถานะ / เงื่อนไข | ระดับความเร่งด่วน | สัญลักษณ์ | การแจ้งเตือน |
| :--- | :---: | :---: | :--- |
| **เลยกำหนดสัญญา (Overdue)** | `crit` | 🔴 | คำนวณค่าปรับรายวัน `มูลค่าสัญญา × %ค่าปรับ ÷ 100` และคิดค่าปรับสะสม |
| **หมดสัญญาวันนี้ / เหลือ <= 7 วัน** | `crit` | 🔴 | แจ้งเตือนฉุกเฉิน เร่งส่งมอบงานหรือทำหนังสือขยายเวลา |
| **เหลือสัญญา 8–14 วัน** | `warn` | 🟡 | แจ้งเตือนเตรียมตัวเร่งรัดงานหน้างาน |
| **เหลือสัญญา 15–30 วัน** | `notice` | 🟡 | แจ้งเตือนระยะปลอดภัย เตรียมเอกสารส่งงวด |
| **เหลือสัญญา > 30 วัน** | `safe` | 🟢 | สถานะปกติ |
| **ส่งงานรอกรรมการตรวจรับ >= 5 วัน** | `milestone` | ⏳ | ติดตามผลตรวจรับพัสดุ เพื่อป้องกันการเบิกจ่ายล่าช้า |

---

## 🛠️ การติดตั้งและรันในเครื่อง (Local Development)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่าไฟล์ Environment Variables
คัดลอกไฟล์ `.env.example` ไปเป็น `.env`:
```bash
cp .env.example .env
```
กำหนดค่า Token และ Channel Secret ที่ได้รับจาก LINE Developers Console

### 3. รัน Database Schema บน Local D1
```bash
npx wrangler d1 execute watchdog-db --local --file=./src/db/schema.sql
```

### 4. สั่งรัน Local Development Server
```bash
npm run dev
# หรือ npx wrangler dev
```
เซิร์ฟเวอร์จะรันที่ `http://localhost:8787`

---

## 🧪 การทดสอบระบบ (Verification Test Suite)

ระบบมีชุดทดสอบครอบคลุมทุกฟังก์ชันการคำนวณ วันที่ภาษาไทย การคิดค่าปรับสะสม และจำลอง Mock Database:

```bash
npm test
# หรือ node tests/verify.js
```

ตัวอย่างผลลัพธ์การทดสอบ:
```
====================================================================
🏗️  CONSTRUCTION CONTRACT WATCHDOG — TEST VERIFICATION SUITE
====================================================================

📦 Suite: Date & Formatting Utilities (src/logic.js)
  ✔ PASS: todayISO() returns YYYY-MM-DD pattern for current date
  ✔ PASS: todayISO(customDate) computes ICT (UTC+7) correctly
  ✔ PASS: addDays() adds positive days correctly across month & year boundary
  ✔ PASS: addDays() subtracts days when negative count provided
  ✔ PASS: addDays() returns empty string when input dateStr is empty/null
  ✔ PASS: daysBetween() calculates correct signed difference (to - from)
  ✔ PASS: formatThaiDate() formats short and full Buddhist era dates
  ✔ PASS: formatMoney() formats numbers with comma separators and no decimals

📦 Suite: Project Metrics & Calculation Engine (computeProjectMetrics)
  ✔ PASS: Calculates current end date with single and multiple time extensions
  ✔ PASS: Correctly calculates safe status (> 30 days remaining)
  ✔ PASS: Correctly categorizes notice urgency (15 to 30 days remaining)
  ✔ PASS: Correctly categorizes warn urgency (8 to 14 days remaining)
  ✔ PASS: Correctly categorizes crit urgency (1 to 7 days remaining)
  ✔ PASS: Correctly categorizes crit urgency for contract ending TODAY (0 days)
  ✔ PASS: Accurately computes daily fine and accumulated fine when contract is OVERDUE
  ✔ PASS: Custom fine rate (0.05%) calculates correct proportional fines
  ✔ PASS: Completed and Terminated status bypass urgency warnings
  ✔ PASS: Milestone analysis separates overdue, due soon, and waiting inspection

📦 Suite: Morning Digest Generation (buildMorningDigest)
  ✔ PASS: buildMorningDigest formats complete alert text with icons (🔴, 🟡, ⏳, 📌)
  ✔ PASS: buildMorningDigest returns empty string if no active contracts exist

📦 Suite: Integration: Mock Cloudflare D1 Database & Worker Data Layer
  ✔ PASS: fetchAllProjectsWithMetrics queries D1 and computes full contract metrics

====================================================================
📊 TEST EXECUTION SUMMARY
====================================================================
  Total Assertions / Tests: 21
  Passed Tests:             21
  Failed Tests:             0

✨ ALL 21 TESTS PASSED WITH 100% SUCCESS!
```

---

## 🤖 การเชื่อมต่อ LINE Official Account & LINE LIFF

1. เข้าสู่ [LINE Developers Console](https://developers.line.biz/)
2. สร้าง Provider และสร้าง Channel ชนิด **Messaging API**:
   - คัดลอก **Channel Secret** และ **Channel Access Token (Long-lived)**
3. ตั้งค่า Webhook URL ใน LINE Developers Console:
   - กำหนด Webhook URL เป็น: `https://<YOUR-WORKER-DOMAIN>/api/line/webhook`
   - เปิดสวิตช์ **Use Webhook** และเปิด **Auto-reply messages: Disabled**
4. การสร้าง **LINE LIFF App**:
   - สร้าง Channel ชนิด **LINE LIFF**
   - กำหนด Endpoint URL เป็น: `https://<YOUR-WORKER-DOMAIN>/` (ชี้ไปที่ Web Dashboard)
   - คัดลอก **LIFF ID** มาใส่ในระบบ
5. **คำสั่งที่รองรับใน LINE Bot:**
   - พิมพ์ `สรุป` หรือ `สถานะ`: บอทจะส่งสรุปสัญญาโครงการทั้งหมดทันที
   - พิมพ์ `help` หรือ `วิธีใช้`: แสดงรายการคำสั่งที่รองรับ
   - ดึงบอทเข้ากลุ่มไลน์โครงการ: บอทจะทำการลงทะเบียน `groupId` เข้าฐานข้อมูลเพื่อส่ง Morning Digest อัตโนมัติ

---

## 🚀 ขั้นตอนการ Deploy ขึ้น Cloudflare Workers & D1

### 1. เข้าสู่ระบบ Cloudflare ผ่าน Wrangler
```bash
npx wrangler login
```

### 2. สร้างฐานข้อมูล Cloudflare D1 บน Cloud
```bash
npx wrangler d1 create watchdog-db
```
นำค่า `database_id` ที่ได้จากคำสั่ง มาอัปเดตแทนที่ `(placeholder-db-id)` ในไฟล์ `wrangler.toml`

### 3. รัน Database Migration บน Cloud D1
```bash
npx wrangler d1 execute watchdog-db --remote --file=./src/db/schema.sql
```

### 4. ตั้งค่า Environment Secrets บน Cloudflare
```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_LIFF_ID
npx wrangler secret put APP_URL
```

### 5. สั่ง Deploy ขึ้น Cloudflare Workers
```bash
npm run deploy
# หรือ npx wrangler deploy
```

เมื่อ Deploy เรียบร้อย ระบบจะเปิดใช้งานทั้ง Web Dashboard, REST API, Webhook สำหรับ LINE, และ Scheduled Cron แจ้งเตือนสัญญาทุก 07:00 น. อัตโนมัติทันที!
