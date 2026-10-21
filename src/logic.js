// ==============================================================================
// 🏗️ Construction Contract Watchdog — Business Logic & Calculation Engine
// ==============================================================================

/**
 * ดึงวันที่ปัจจุบันตามเวลาประเทศไทย (ICT = UTC+7) ในรูปแบบ YYYY-MM-DD
 */
export function todayISO(customDate = null) {
  const d = customDate ? new Date(customDate) : new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const ict = new Date(utc + (7 * 3600000));
  const year = ict.getFullYear();
  const month = String(ict.getMonth() + 1).padStart(2, '0');
  const day = String(ict.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * บวกจำนวนวันเข้ากับวันที่ YYYY-MM-DD
 */
export function addDays(dateStr, days) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  const rY = dt.getUTCFullYear();
  const rM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rD = String(dt.getUTCDate()).padStart(2, '0');
  return `${rY}-${rM}-${rD}`;
}

/**
 * คำนวณจำนวนวันระหว่างสองวัน (to - from)
 * ค่าบวก = to อยู่หลัง from
 * ค่าลบ = to อยู่ก่อน from (เลยกำหนด)
 */
export function daysBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return 0;
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * แปลงวันที่ YYYY-MM-DD เป็นรูปแบบภาษาไทย
 * เช่น "2026-10-21" -> "21 ต.ค. 69" หรือแบบเต็ม
 */
export function formatThaiDate(dateStr, full = false) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-').map(Number);
  const thaiMonthsShort = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const thaiMonthsFull = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  
  const thYear = (y + 543) % 100; // เช่น 2569 -> 69
  const thYearFull = y + 543;
  
  if (full) {
    return `${d} ${thaiMonthsFull[m]} ${thYearFull}`;
  }
  return `${d} ${thaiMonthsShort[m]} ${thYear}`;
}

/**
 * จัดรูปแบบตัวเลขเงินบาท
 */
export function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

/**
 * คำนวณ Metrics สัญญาและสถานะของแต่ละโครงการ
 */
export function computeProjectMetrics(project, extensions = [], milestones = [], documents = [], todayStr = todayISO()) {
  const totalExtendedDays = (extensions || []).reduce((sum, ext) => sum + (Number(ext.days_added) || 0), 0);
  const currentEndDate = addDays(project.original_end_date, totalExtendedDays);
  const daysRemaining = daysBetween(todayStr, currentEndDate);
  const isOverdue = daysRemaining < 0;
  const overdueDays = isOverdue ? -daysRemaining : 0;

  // คำนวณค่าปรับรายวัน (Daily Fine)
  // สูตร: มูลค่าสัญญา * (% ค่าปรับ / 100)
  const fineRate = Number(project.fine_rate_percent) || 0.1;
  const contractVal = Number(project.contract_value) || 0;
  const dailyFine = Math.round(contractVal * (fineRate / 100));
  const accumulatedFine = isOverdue ? overdueDays * dailyFine : 0;

  // การจัดหมวดหมู่อาการความเร่งด่วน (Severity Level)
  let severity = 'safe'; // 'crit', 'warn', 'notice', 'safe', 'completed'
  let badgeText = '';
  let badgeColor = 'green';

  if (project.status === 'completed') {
    severity = 'completed';
    badgeText = '✅ ส่งมอบงานแล้ว';
    badgeColor = 'blue';
  } else if (project.status === 'terminated') {
    severity = 'completed';
    badgeText = '⛔ สิ้นสุด/ยกเลิกสัญญา';
    badgeColor = 'gray';
  } else if (isOverdue) {
    severity = 'crit';
    badgeText = `🔴 เลยกำหนด ${overdueDays} วัน`;
    badgeColor = 'red';
  } else if (daysRemaining === 0) {
    severity = 'crit';
    badgeText = '🔴 หมดสัญญาวันนี้!';
    badgeColor = 'red';
  } else if (daysRemaining <= 7) {
    severity = 'crit';
    badgeText = `🔴 เหลือสัญญา ${daysRemaining} วัน`;
    badgeColor = 'red';
  } else if (daysRemaining <= 14) {
    severity = 'warn';
    badgeText = `🟡 เหลือสัญญา ${daysRemaining} วัน`;
    badgeColor = 'orange';
  } else if (daysRemaining <= 30) {
    severity = 'notice';
    badgeText = `🟡 เหลือสัญญา ${daysRemaining} วัน`;
    badgeColor = 'yellow';
  } else {
    severity = 'safe';
    badgeText = `🟢 เหลือสัญญา ${daysRemaining} วัน`;
    badgeColor = 'green';
  }

  // วิเคราะห์งวดงาน (Milestones)
  const activeMilestones = milestones || [];
  const overdueMilestones = activeMilestones.filter(m => m.status === 'pending' && m.target_date && daysBetween(todayStr, m.target_date) < 0);
  const dueSoonMilestones = activeMilestones.filter(m => m.status === 'pending' && m.target_date && daysBetween(todayStr, m.target_date) >= 0 && daysBetween(todayStr, m.target_date) <= 7);
  const inspectionWaitingMilestones = activeMilestones.filter(m => m.status === 'submitted' && m.submitted_date);

  // วิเคราะห์หนังสือค้างตอบ (Documents)
  const waitingReplyDocs = (documents || []).filter(d => d.status === 'sent_waiting_reply' && d.sent_date);

  return {
    ...project,
    totalExtendedDays,
    currentEndDate,
    daysRemaining,
    isOverdue,
    overdueDays,
    dailyFine,
    accumulatedFine,
    severity,
    badgeText,
    badgeColor,
    overdueMilestones,
    dueSoonMilestones,
    inspectionWaitingMilestones,
    waitingReplyDocs,
    extensionsCount: (extensions || []).length
  };
}

/**
 * สร้างข้อความสรุปช่วงเช้า (Morning Digest) สำหรับยิงเข้า LINE
 */
export function buildMorningDigest(projectsWithMetrics, todayStr = todayISO(), appUrl = '') {
  const activeProjects = projectsWithMetrics.filter(p => p.status === 'active');
  if (!activeProjects.length) return '';

  const lines = [];
  lines.push(`🏗️ Construction Watchdog — แจ้งเตือนสัญญาวันนี้`);
  lines.push(`📅 ประจำเช้า ${formatThaiDate(todayStr, true)}`);
  lines.push(`---------------------------------`);

  // หมวด 1: โครงการที่เลยกำหนดสัญญา (Overdue)
  const overdueProjects = activeProjects.filter(p => p.isOverdue);
  if (overdueProjects.length > 0) {
    lines.push(`\n🚨 สัญญาเลยกำหนด (กำลังคิดค่าปรับ):`);
    for (const p of overdueProjects) {
      lines.push(`🔴 [${p.name}] เลยกำหนดมาแล้ว ${p.overdueDays} วัน`);
      lines.push(`   💸 ค่าปรับประมาณวันละ: ${formatMoney(p.dailyFine)} บาท`);
      lines.push(`   📈 ค่าปรับสะสมโดยประมาณ: ${formatMoney(p.accumulatedFine)} บาท`);
      lines.push(`   (สิ้นสุดสัญญาเมื่อ: ${formatThaiDate(p.currentEndDate)})`);
    }
  }

  // หมวด 2: โครงการที่ใกล้หมดสัญญา (เหลือ <= 14 วัน)
  const urgentProjects = activeProjects.filter(p => !p.isOverdue && p.daysRemaining <= 14);
  if (urgentProjects.length > 0) {
    lines.push(`\n⚠️ สัญญาใกล้ครบกำหนด (เร่งหน้างาน / ขยายเวลา):`);
    for (const p of urgentProjects) {
      if (p.daysRemaining === 0) {
        lines.push(`🔴 [${p.name}] ครบกำหนดสัญญาวันนี้!`);
      } else if (p.daysRemaining <= 7) {
        lines.push(`🔴 [${p.name}] สัญญาเหลืออีกเพียง ${p.daysRemaining} วัน! (ครบ ${formatThaiDate(p.currentEndDate)})`);
      } else {
        lines.push(`🟡 [${p.name}] สัญญาเหลืออีก ${p.daysRemaining} วัน (ครบ ${formatThaiDate(p.currentEndDate)})`);
      }
      lines.push(`   ⚠️ หากเลยกำหนด ค่าปรับวันละ ${formatMoney(p.dailyFine)} บาท`);
    }
  }

  // หมวด 3: โครงการที่ระยะปลอดภัยเตือนล่วงหน้า (15 - 30 วัน)
  const noticeProjects = activeProjects.filter(p => p.daysRemaining > 14 && p.daysRemaining <= 30);
  if (noticeProjects.length > 0) {
    lines.push(`\n📋 สัญญาเตรียมตัวล่วงหน้า (15–30 วัน):`);
    for (const p of noticeProjects) {
      lines.push(`ℹ️ [${p.name}] สัญญาเหลือ ${p.daysRemaining} วัน (สิ้นสุด ${formatThaiDate(p.currentEndDate)})`);
    }
  }

  // หมวด 4: งวดงานค้างส่ง หรือ รอกรรมการตรวจรับ
  const milestoneLines = [];
  for (const p of activeProjects) {
    // งวดที่ส่งแล้วรอกรรมการตรวจรับ
    for (const m of p.inspectionWaitingMilestones) {
      const waitDays = daysBetween(m.submitted_date, todayStr);
      if (waitDays >= 5) {
        milestoneLines.push(`⏳ [${p.name}] งวดที่ ${m.milestone_no} ส่งงานไปแล้ว ${waitDays} วัน (ยังรอผลตรวจรับพัสดุ)`);
      }
    }
    // งวดงานที่ครบกำหนดส่งใน 7 วัน
    for (const m of p.dueSoonMilestones) {
      const remain = daysBetween(todayStr, m.target_date);
      const dayLabel = remain === 0 ? 'วันนี้' : remain === 1 ? 'พรุ่งนี้' : `อีก ${remain} วัน`;
      milestoneLines.push(`📌 [${p.name}] ครบกำหนดส่งมอบงวดที่ ${m.milestone_no} (${dayLabel} - ${formatThaiDate(m.target_date)})`);
    }
  }

  if (milestoneLines.length > 0) {
    lines.push(`\n🎯 ติดตามงวดงานและการตรวจรับ:`);
    lines.push(...milestoneLines.slice(0, 8));
    if (milestoneLines.length > 8) {
      lines.push(`   …และอีก ${milestoneLines.length - 8} รายการ ดูในระบบ`);
    }
  }

  // ส่วนท้าย
  lines.push(`\n---------------------------------`);
  if (appUrl) {
    lines.push(`📲 เปิดดูรายละเอียดและบันทึกขยายสัญญา:`);
    lines.push(appUrl);
  } else {
    lines.push(`👉 แตะเปิดแอปใน LINE หรือเปิดผ่านเบราว์เซอร์เพื่อจัดการสัญญา`);
  }

  return lines.join('\n');
}
