-- ==============================================================================
-- 🏗️ Construction Contract Watchdog — Database Schema (Cloudflare D1 / SQLite)
-- ==============================================================================

-- 1. ตารางข้อมูลโครงการและสัญญาหลัก
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                                  -- ชื่อโครงการ เช่น "งานก่อสร้างอาคารเรียน 3 ชั้น"
    contract_no TEXT,                                   -- เลขที่สัญญา เช่น "45/2569"
    client_name TEXT,                                   -- หน่วยงานผู้ว่าจ้าง เช่น "เทศบาลนครรังสิต"
    contractor_name TEXT,                               -- ผู้รับจ้าง (บริษัทเรา / ห้างหุ้นส่วน)
    start_date TEXT NOT NULL,                           -- วันเริ่มสัญญา YYYY-MM-DD
    original_end_date TEXT NOT NULL,                    -- วันสิ้นสุดสัญญาตาม TOR เดิม YYYY-MM-DD
    contract_value REAL NOT NULL DEFAULT 0,             -- วงเงินสัญญา (บาท)
    fine_rate_percent REAL NOT NULL DEFAULT 0.1,        -- อัตราค่าปรับรายวัน (%) ส่วนใหญ่ 0.1% หรือ 0.01%
    status TEXT NOT NULL DEFAULT 'active',              -- 'active', 'completed', 'terminated'
    notes TEXT,                                         -- บันทึกข้อความเพิ่มเติม
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. ตารางบันทึกการขยายอายุสัญญา / งดลดค่าปรับ (Contract Time Extensions)
CREATE TABLE IF NOT EXISTS contract_extensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    extension_no INTEGER NOT NULL DEFAULT 1,             -- ขยายครั้งที่
    days_added INTEGER NOT NULL,                        -- จำนวนวันที่ขยายเพิ่ม (วัน)
    reason TEXT NOT NULL,                               -- เหตุผล เช่น "ส่งมอบพื้นที่ล่าช้า / มติ ครม. อุทกภัย"
    doc_ref TEXT,                                       -- เลขที่หนังสืออนุมัติ
    approved_date TEXT,                                 -- วันที่อนุมัติ YYYY-MM-DD
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. ตารางงวดงานและการส่งมอบ (Milestones)
CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_no INTEGER NOT NULL,                      -- งวดที่ (1, 2, 3...)
    title TEXT NOT NULL,                                -- รายละเอียดงานในงวด
    amount REAL NOT NULL DEFAULT 0,                     -- จำนวนเงินค่างวด (บาท)
    target_date TEXT NOT NULL,                          -- วันครบกำหนดส่งมอบตามแผน YYYY-MM-DD
    status TEXT NOT NULL DEFAULT 'pending',             -- 'pending', 'submitted', 'approved', 'paid'
    submitted_date TEXT,                                -- วันที่ยื่นส่งมอบงานจริง YYYY-MM-DD
    approved_date TEXT,                                 -- วันที่คณะกรรมการตรวจรับเสร็จสิ้น
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 4. ตารางหนังสือเข้า-ออกและติดตามงาน (Letters & Document Tracking)
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL DEFAULT 'out',               -- 'in' (หนังสือเข้า), 'out' (หนังสือออก)
    doc_no TEXT,                                        -- เลขที่หนังสือ
    title TEXT NOT NULL,                                -- เรื่อง เช่น "ขออนุมัติใช้วัสดุหินคลุก", "ขอขยายเวลาสัญญา"
    party TEXT,                                         -- ถึง / จาก (เช่น "ผู้ควบคุมงาน", "ประธานกรรมการตรวจรับ")
    sent_date TEXT,                                     -- วันที่ส่งหนังสือ YYYY-MM-DD
    due_date TEXT,                                      -- กำหนดตอบกลับ YYYY-MM-DD
    status TEXT NOT NULL DEFAULT 'sent_waiting_reply',   -- 'draft', 'sent_waiting_reply', 'replied', 'closed'
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 5. ตารางผู้รับการแจ้งเตือน LINE (Users & Groups)
CREATE TABLE IF NOT EXISTS line_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT UNIQUE NOT NULL,                     -- userId หรือ groupId จาก LINE
    target_type TEXT NOT NULL DEFAULT 'user',           -- 'user', 'group'
    display_name TEXT,                                  -- ชื่อผู้ใช้ / ชื่อกลุ่ม
    is_active INTEGER NOT NULL DEFAULT 1,               -- 1 = รับการแจ้งเตือน, 0 = ปิด
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. ตารางการตั้งค่าระบบ (System Settings / Key-Value)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- สร้าง Indexes เพื่อความรวดเร็วในการ Query
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_extensions_project ON contract_extensions(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
