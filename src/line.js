// ==============================================================================
// 🟢 Construction Contract Watchdog — LINE Messaging API & LIFF Integration
// ==============================================================================

import { buildMorningDigest, todayISO } from './logic.js';

/**
 * ดึง Token ของ LINE จากตัวแปร env หรือจากฐานข้อมูล system_settings
 */
export async function getLineToken(env, db) {
  let token = env?.LINE_CHANNEL_TOKEN || env?.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token && db) {
    try {
      const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'LINE_CHANNEL_ACCESS_TOKEN'").first();
      token = row?.value || null;
    } catch {}
  }
  return token;
}

/**
 * ดึง Secret ของ LINE จากตัวแปร env หรือจากฐานข้อมูล system_settings
 */
export async function getLineSecret(env, db) {
  let secret = env?.LINE_CHANNEL_SECRET;
  if (!secret && db) {
    try {
      const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'LINE_CHANNEL_SECRET'").first();
      secret = row?.value || null;
    } catch {}
  }
  return secret;
}

/**
 * ตรวจสอบความถูกต้องของ LINE Webhook Signature ด้วย WebCrypto (Native ใน Cloudflare Workers)
 */
export async function verifyLineSignature(env, bodyBuffer, signatureHeader, db) {
  const secret = await getLineSecret(env, db);
  if (!secret) return true; // ถ้ายังไม่ได้ตั้งค่า secret ให้ bypass ได้
  if (!signatureHeader) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, bodyBuffer);
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
  return base64Sig === signatureHeader;
}

/**
 * ส่งข้อความ Push Message ไปยัง LINE User หรือ Group
 */
export async function linePush(env, targetId, text, db) {
  const token = await getLineToken(env, db);
  if (!token) {
    console.warn('⚠️ ขาดการตั้งค่า LINE_CHANNEL_TOKEN');
    return { ok: false, error: 'no_token' };
  }

  const payload = {
    to: targetId,
    messages: [
      {
        type: 'text',
        text: text
      }
    ]
  };

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.text();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('Error sending LINE Push:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * ส่งข้อความ Reply ตอบกลับ Webhook ของ LINE
 */
export async function lineReply(env, replyToken, text, db) {
  const token = await getLineToken(env, db);
  if (!token || !replyToken) return false;

  const payload = {
    replyToken,
    messages: [{ type: 'text', text }]
  };

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error('Error sending LINE Reply:', err);
    return false;
  }
}

/**
 * จัดการ Webhook Events ที่ส่งมาจาก LINE
 * - จับ event follow / join เพื่อบันทึกผู้รับแจ้งเตือนลงฐานข้อมูล
 * - จับข้อความคำสั่งเช่น "สรุป", "สถานะ", "help"
 */
export async function handleLineWebhook(env, db, body, fetchAllProjectsWithMetrics) {
  const events = body.events || [];
  for (const ev of events) {
    const source = ev.source || {};
    const targetId = source.groupId || source.roomId || source.userId;
    const targetType = source.groupId ? 'group' : source.roomId ? 'room' : 'user';

    // 1. ลงทะเบียนผู้รับแจ้งเตือนอัตโนมัติเมื่อเพิ่มเพื่อน หรือดึงบอทเข้ากลุ่ม
    if (ev.type === 'follow' || ev.type === 'join') {
      if (targetId && db) {
        await db.prepare(`
          INSERT INTO line_recipients (target_id, target_type, is_active)
          VALUES (?, ?, 1)
          ON CONFLICT(target_id) DO UPDATE SET is_active = 1
        `).bind(targetId, targetType).run();
      }

      if (ev.replyToken) {
        const welcomeText = `🏗️ ยินดีต้อนรับสู่ Construction Contract Watchdog!\n\n` +
          `ระบบนี้จะช่วยส่งสรุปแจ้งเตือนวันหมดสัญญาและงวดงานก่อสร้างทุกเช้าเวลา 07:00 น.\n\n` +
          `📌 คำสั่งที่พิมพ์ได้:\n` +
          `- พิมพ์ "สรุป" เพื่อดูสถานะสัญญาทั้งหมดตอนนี้\n` +
          `- หรือเปิดแอปผ่านเมนูด้านล่างเพื่อเพิ่มโครงการ/ขยายสัญญาได้ทันทีครับ`;
        await lineReply(env, ev.replyToken, welcomeText, db);
      }
      continue;
    }

    // 2. ถ้าผู้ใช้กดบล็อก หรือเตะบอทออกจากกลุ่ม
    if (ev.type === 'unfollow' || ev.type === 'leave') {
      if (targetId && db) {
        await db.prepare(`UPDATE line_recipients SET is_active = 0 WHERE target_id = ?`).bind(targetId).run();
      }
      continue;
    }

    // 3. รับข้อความคำสั่ง
    if (ev.type === 'message' && ev.message?.type === 'text') {
      const msg = (ev.message.text || '').trim().toLowerCase();

      // บันทึก ID ผู้ส่งไว้เผื่อยังไม่มีในระบบ
      if (targetId && db) {
        await db.prepare(`
          INSERT OR IGNORE INTO line_recipients (target_id, target_type, is_active)
          VALUES (?, ?, 1)
        `).bind(targetId, targetType).run();
      }

      if (['สรุป', 'status', 'เตือน', 'สัญญา', 'report'].includes(msg)) {
        if (fetchAllProjectsWithMetrics) {
          const projects = await fetchAllProjectsWithMetrics(db);
          const appUrl = env.APP_URL || '';
          const digest = buildMorningDigest(projects, todayISO(), appUrl);
          await lineReply(env, ev.replyToken, digest || '✅ ขณะนี้ไม่มีโครงการที่กำลังดำเนินการอยู่ครับ', db);
        } else {
          await lineReply(env, ev.replyToken, 'กำลังดึงข้อมูลโครงการ กรุณารอสักครู่...', db);
        }
      } else if (['help', 'วิธีใช้', 'คู่มือ'].includes(msg)) {
        const helpText = `📖 วิธีใช้งาน Construction Watchdog:\n\n` +
          `1. พิมพ์ "สรุป" -> ระบบจะรายงานสถานะสัญญาทุกโครงการแบบสรุปด่วน\n` +
          `2. ระบบจะส่งแจ้งเตือนอัตโนมัติทุกเช้า 07:00 น.\n` +
          `3. สำหรับการเพิ่มโครงการ หรือขยายอายุสัญญา ให้เปิดผ่านลิงก์ Web App: ${env.APP_URL || '(ตั้งค่าใน .dev.vars)'}`;
        await lineReply(env, ev.replyToken, helpText, db);
      }
    }
  }
}
