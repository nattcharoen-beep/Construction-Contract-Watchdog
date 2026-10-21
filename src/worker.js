// ==============================================================================
// ⚡ Construction Contract Watchdog — Cloudflare Workers API & Cron Server
// ==============================================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { computeProjectMetrics, buildMorningDigest, todayISO } from './logic.js';
import * as line from './line.js';

const app = new Hono();

// เปิดใช้งาน CORS สำหรับ Web Dashboard & LIFF
app.use('*', cors());

// Helper สำหรับดึงข้อมูลโครงการทั้งหมดพร้อม Metrics ที่คำนวณแล้ว
export async function fetchAllProjectsWithMetrics(db) {
  if (!db) return [];

  const projects = (await db.prepare(`SELECT * FROM projects ORDER BY status ASC, id DESC`).all()).results || [];
  const extensions = (await db.prepare(`SELECT * FROM contract_extensions ORDER BY id ASC`).all()).results || [];
  const milestones = (await db.prepare(`SELECT * FROM milestones ORDER BY milestone_no ASC`).all()).results || [];
  const documents = (await db.prepare(`SELECT * FROM documents ORDER BY id DESC`).all()).results || [];

  const today = todayISO();

  return projects.map(p => {
    const pExtensions = extensions.filter(e => e.project_id === p.id);
    const pMilestones = milestones.filter(m => m.project_id === p.id);
    const pDocs = documents.filter(d => d.project_id === p.id);
    return computeProjectMetrics(p, pExtensions, pMilestones, pDocs, today);
  });
}

// ---------- API Routes ----------

// 1. Health check
app.get('/api/health', c => {
  return c.json({ status: 'ok', service: 'Construction Contract Watchdog', time: new Date().toISOString() });
});

// 2. ดึงรายการโครงการทั้งหมด
app.get('/api/projects', async c => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'DB not bound' }, 500);

  const projects = await fetchAllProjectsWithMetrics(db);
  return c.json({ projects, today: todayISO() });
});

// 3. ดึงรายละเอียดโครงการเดี่ยว
app.get('/api/projects/:id', async c => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const extensions = (await db.prepare(`SELECT * FROM contract_extensions WHERE project_id = ? ORDER BY extension_no ASC`).bind(id).all()).results || [];
  const milestones = (await db.prepare(`SELECT * FROM milestones WHERE project_id = ? ORDER BY milestone_no ASC`).bind(id).all()).results || [];
  const documents = (await db.prepare(`SELECT * FROM documents WHERE project_id = ? ORDER BY id DESC`).bind(id).all()).results || [];

  const metrics = computeProjectMetrics(project, extensions, milestones, documents, todayISO());
  return c.json({ project: metrics, extensions, milestones, documents });
});

// 4. สร้างโครงการใหม่
app.post('/api/projects', async c => {
  const db = c.env.DB;
  const body = await c.req.json();

  if (!body.name || !body.start_date || !body.original_end_date) {
    return c.json({ error: 'กรุณากรอกชื่อโครงการ, วันเริ่มสัญญา, และวันสิ้นสุดสัญญา' }, 400);
  }

  const res = await db.prepare(`
    INSERT INTO projects (name, contract_no, client_name, contractor_name, start_date, original_end_date, contract_value, fine_rate_percent, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.name,
    body.contract_no || '',
    body.client_name || '',
    body.contractor_name || '',
    body.start_date,
    body.original_end_date,
    Number(body.contract_value) || 0,
    Number(body.fine_rate_percent) || 0.1,
    body.status || 'active',
    body.notes || ''
  ).run();

  return c.json({ ok: true, id: res.meta?.last_row_id });
});

// 5. แก้ไขข้อมูลโครงการ
app.put('/api/projects/:id', async c => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  await db.prepare(`
    UPDATE projects
    SET name = ?, contract_no = ?, client_name = ?, contractor_name = ?,
        start_date = ?, original_end_date = ?, contract_value = ?,
        fine_rate_percent = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    body.name,
    body.contract_no || '',
    body.client_name || '',
    body.contractor_name || '',
    body.start_date,
    body.original_end_date,
    Number(body.contract_value) || 0,
    Number(body.fine_rate_percent) || 0.1,
    body.status || 'active',
    body.notes || '',
    id
  ).run();

  return c.json({ ok: true });
});

// 6. ลบโครงการ
app.delete('/api/projects/:id', async c => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// 7. บันทึกการขยายอายุสัญญา (Time Extension)
app.post('/api/projects/:id/extensions', async c => {
  const db = c.env.DB;
  const projectId = Number(c.req.param('id'));
  const body = await c.req.json();

  if (!body.days_added || isNaN(Number(body.days_added))) {
    return c.json({ error: 'กรุณาระบุจำนวนวันที่ขยายเพิ่ม' }, 400);
  }

  // คำนวณครั้งที่ขยายอัตโนมัติ
  const maxExt = await db.prepare(`SELECT MAX(extension_no) as max_no FROM contract_extensions WHERE project_id = ?`).bind(projectId).first();
  const nextNo = (maxExt?.max_no || 0) + 1;

  await db.prepare(`
    INSERT INTO contract_extensions (project_id, extension_no, days_added, reason, doc_ref, approved_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    projectId,
    nextNo,
    Number(body.days_added),
    body.reason || 'ขอขยายระยะเวลาสัญญา',
    body.doc_ref || '',
    body.approved_date || todayISO()
  ).run();

  return c.json({ ok: true, extension_no: nextNo });
});

// 8. ลบรายการขยายสัญญา
app.delete('/api/extensions/:id', async c => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  await db.prepare(`DELETE FROM contract_extensions WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// 9. งวดงาน (Milestones)
app.post('/api/projects/:id/milestones', async c => {
  const db = c.env.DB;
  const projectId = Number(c.req.param('id'));
  const body = await c.req.json();

  await db.prepare(`
    INSERT INTO milestones (project_id, milestone_no, title, amount, target_date, status, submitted_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    projectId,
    Number(body.milestone_no) || 1,
    body.title || 'งวดงาน',
    Number(body.amount) || 0,
    body.target_date || todayISO(),
    body.status || 'pending',
    body.submitted_date || null,
    body.notes || ''
  ).run();

  return c.json({ ok: true });
});

app.put('/api/milestones/:id', async c => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  await db.prepare(`
    UPDATE milestones
    SET milestone_no = ?, title = ?, amount = ?, target_date = ?,
        status = ?, submitted_date = ?, approved_date = ?, notes = ?
    WHERE id = ?
  `).bind(
    Number(body.milestone_no),
    body.title,
    Number(body.amount) || 0,
    body.target_date,
    body.status,
    body.submitted_date || null,
    body.approved_date || null,
    body.notes || '',
    id
  ).run();

  return c.json({ ok: true });
});

app.delete('/api/milestones/:id', async c => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  await db.prepare(`DELETE FROM milestones WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// 10. พรีวิวข้อความแจ้งเตือน LINE (Morning Digest Preview)
app.get('/api/digest/preview', async c => {
  const db = c.env.DB;
  const projects = await fetchAllProjectsWithMetrics(db);
  const appUrl = c.env.APP_URL || '';
  const digest = buildMorningDigest(projects, todayISO(), appUrl);
  return c.json({ digest, generated_at: new Date().toISOString() });
});

// 11. สั่งยิงแจ้งเตือนเข้า LINE ทันที (Manual Trigger)
app.post('/api/digest/send', async c => {
  const db = c.env.DB;
  const projects = await fetchAllProjectsWithMetrics(db);
  const appUrl = c.env.APP_URL || '';
  const digest = buildMorningDigest(projects, todayISO(), appUrl);

  if (!digest) {
    return c.json({ ok: true, message: 'ไม่มีโครงการที่ต้องแจ้งเตือน' });
  }

  // ดึงรายชื่อผู้รับทั้งหมดที่เปิดใช้งาน
  const recipients = (await db.prepare(`SELECT target_id FROM line_recipients WHERE is_active = 1`).all()).results || [];
  const results = [];

  for (const r of recipients) {
    const res = await line.linePush(c.env, r.target_id, digest);
    results.push({ target_id: r.target_id, result: res });
  }

  return c.json({ ok: true, recipients_count: recipients.length, results });
});

// 11.1 รายชื่อผู้รับการแจ้งเตือน LINE ทั้งหมด
app.get('/api/line/recipients', async c => {
  const db = c.env.DB;
  if (!db) return c.json({ recipients: [] });
  const recipients = (await db.prepare(`SELECT * FROM line_recipients ORDER BY id DESC`).all()).results || [];
  return c.json({ recipients });
});

// 11.2 ลงทะเบียนผู้รับแจ้งเตือน LINE (จากเว็บ หรือ LINE LIFF)
app.post('/api/line/register', async c => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'DB not bound' }, 500);
  const body = await c.req.json();
  const targetId = body.target_id || body.userId;
  const displayName = body.display_name || body.displayName || 'LINE User';
  const targetType = body.target_type || 'user';

  if (!targetId) {
    return c.json({ error: 'กรุณาระบุ Target ID หรือ User ID' }, 400);
  }

  await db.prepare(`
    INSERT INTO line_recipients (target_id, target_type, display_name, is_active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(target_id) DO UPDATE SET is_active = 1, display_name = excluded.display_name
  `).bind(targetId, targetType, displayName).run();

  return c.json({ ok: true, target_id: targetId, display_name: displayName });
});

// 11.3 ลบผู้รับแจ้งเตือน
app.delete('/api/line/recipients/:id', async c => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  await db.prepare(`DELETE FROM line_recipients WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// 12. LINE Webhook Endpoint
app.post('/api/line/webhook', async c => {
  const bodyBuf = await c.req.raw.clone().arrayBuffer();
  const sig = c.req.header('x-line-signature');
  const valid = await line.verifyLineSignature(c.env, bodyBuf, sig);
  if (!valid) return c.text('Invalid signature', 401);

  let body = {};
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBuf) || '{}');
  } catch {}

  await line.handleLineWebhook(c.env, c.env.DB, body, fetchAllProjectsWithMetrics);
  return c.text('OK', 200);
});

// Fallback ให้โหลด Static Web App (index.html, app.js, style.css)
app.all('*', c => {
  if (c.env.ASSETS) {
    const url = new URL(c.req.url);
    if (url.pathname === '/' || !url.pathname.includes('.')) {
      url.pathname = '/index.html';
    }
    return c.env.ASSETS.fetch(new Request(url, c.req.raw));
  }
  return c.text('Construction Watchdog API Server', 200);
});

// ---------- Cron Trigger: ยิงแจ้งเตือนทุกเช้า 7:00 น. ICT (00:00 UTC) ----------
async function scheduled(event, env, ctx) {
  console.log('⏰ Running Morning Contract Digest Cron...');
  const db = env.DB;
  if (!db) {
    console.error('Database binding missing in cron execution.');
    return;
  }

  const projects = await fetchAllProjectsWithMetrics(db);
  const appUrl = env.APP_URL || '';
  const digest = buildMorningDigest(projects, todayISO(), appUrl);

  if (!digest) {
    console.log('No active contracts requiring digest today.');
    return;
  }

  const recipients = (await db.prepare(`SELECT target_id FROM line_recipients WHERE is_active = 1`).all()).results || [];
  console.log(`Sending morning digest to ${recipients.length} LINE recipients...`);

  for (const r of recipients) {
    try {
      await line.linePush(env, r.target_id, digest);
    } catch (e) {
      console.error(`Failed to push to ${r.target_id}:`, e.message);
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled
};
