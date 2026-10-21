// ==============================================================================
// 🏗️ Construction Contract Watchdog — Frontend Controller (Web & LINE LIFF)
// ==============================================================================

const state = {
  projects: [],
  today: '',
  currentFilter: 'all',
  searchQuery: '',
  activeProjectId: null,
  activeProjectDetail: null,
  liffProfile: null,
  recipients: []
};

// ---------- Format Helpers ----------

function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

function formatThaiDate(dateStr, full = false) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);

  const thaiMonthsShort = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const thaiMonthsFull = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  
  const thYearShort = (y + 543) % 100;
  const thYearFull = y + 543;

  if (full) {
    return `${d} ${thaiMonthsFull[m]} ${thYearFull}`;
  }
  return `${d} ${thaiMonthsShort[m]} ${thYearShort}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white border-emerald-400',
    error: 'bg-rose-600 text-white border-rose-400',
    info: 'bg-slate-800 text-white border-slate-600'
  };
  const icons = {
    success: '✅',
    error: '⚠️',
    info: 'ℹ️'
  };

  toast.className = `flex items-center space-x-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs sm:text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---------- Modal Helpers ----------

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

// ---------- API Calls ----------

async function fetchProjects() {
  const loadingEl = document.getElementById('loading-state');
  const container = document.getElementById('projects-container');
  
  if (loadingEl && state.projects.length === 0) {
    loadingEl.classList.remove('hidden');
  }

  try {
    const res = await fetch('/api/projects');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.projects = data.projects || [];
    state.today = data.today || new Date().toISOString().slice(0, 10);

    // Update Header Date
    const headerDateEl = document.getElementById('header-today-date');
    if (headerDateEl) {
      headerDateEl.textContent = formatThaiDate(state.today, true);
    }

    renderDashboard();
  } catch (err) {
    console.error('Fetch projects error:', err);
    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ หรือยังไม่มีฐานข้อมูล', 'error');
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

// ---------- Render Engine ----------

function renderDashboard() {
  const container = document.getElementById('projects-container');
  const emptyState = document.getElementById('empty-state');
  if (!container) return;

  // 1. Calculate KPI Metrics
  let overdueCount = 0;
  let warnCount = 0;
  let safeCount = 0;
  let completedCount = 0;
  let totalFine = 0;

  state.projects.forEach(p => {
    if (p.status === 'completed' || p.status === 'terminated') {
      completedCount++;
    } else {
      if (p.isOverdue || p.daysRemaining < 0) {
        overdueCount++;
        totalFine += (p.accumulatedFine || 0);
      } else if (p.daysRemaining <= 14) {
        warnCount++;
      } else {
        safeCount++;
      }
    }
  });

  // Update KPI Stat Cards
  const kpiCritEl = document.getElementById('kpi-crit-count');
  const kpiWarnEl = document.getElementById('kpi-warn-count');
  const kpiSafeEl = document.getElementById('kpi-safe-count');
  const kpiFineEl = document.getElementById('kpi-total-fine');

  if (kpiCritEl) kpiCritEl.textContent = overdueCount;
  if (kpiWarnEl) kpiWarnEl.textContent = warnCount;
  if (kpiSafeEl) kpiSafeEl.textContent = safeCount;
  if (kpiFineEl) kpiFineEl.textContent = `฿${formatMoney(totalFine)}`;

  // Update Filter Tabs Counts
  const countAllEl = document.getElementById('count-all');
  const countCritEl = document.getElementById('count-crit');
  const countWarnEl = document.getElementById('count-warn');
  const countSafeEl = document.getElementById('count-safe');
  const countCompEl = document.getElementById('count-completed');

  if (countAllEl) countAllEl.textContent = state.projects.length;
  if (countCritEl) countCritEl.textContent = overdueCount;
  if (countWarnEl) countWarnEl.textContent = warnCount;
  if (countSafeEl) countSafeEl.textContent = safeCount;
  if (countCompEl) countCompEl.textContent = completedCount;

  // 2. Filter & Search
  const query = (state.searchQuery || '').trim().toLowerCase();
  const filtered = state.projects.filter(p => {
    // Filter Tab Match
    if (state.currentFilter === 'crit') {
      if (p.status !== 'active' || (!p.isOverdue && p.daysRemaining > 0)) return false;
    } else if (state.currentFilter === 'warn') {
      if (p.status !== 'active' || p.isOverdue || p.daysRemaining > 14) return false;
    } else if (state.currentFilter === 'safe') {
      if (p.status !== 'active' || p.isOverdue || p.daysRemaining <= 14) return false;
    } else if (state.currentFilter === 'completed') {
      if (p.status !== 'completed' && p.status !== 'terminated') return false;
    }

    // Search Query Match
    if (query) {
      const matchName = (p.name || '').toLowerCase().includes(query);
      const matchContract = (p.contract_no || '').toLowerCase().includes(query);
      const matchClient = (p.client_name || '').toLowerCase().includes(query);
      const matchContractor = (p.contractor_name || '').toLowerCase().includes(query);
      if (!matchName && !matchContract && !matchClient && !matchContractor) return false;
    }

    return true;
  });

  // 3. Render Cards
  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = filtered.map(p => {
    const isCritOverdue = p.isOverdue && p.status === 'active';
    const cardClass = isCritOverdue ? 'card-critical' : '';

    // Badge styling & text
    let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (p.status === 'completed') {
      badgeClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    } else if (p.status === 'terminated') {
      badgeClass = 'bg-slate-700 text-slate-300 border-slate-600';
    } else if (p.isOverdue) {
      badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/50 font-bold badge-pulse';
    } else if (p.daysRemaining <= 7) {
      badgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-semibold';
    } else if (p.daysRemaining <= 14) {
      badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold';
    } else if (p.daysRemaining <= 30) {
      badgeClass = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
    }

    // Extension Summary Text
    const extText = p.totalExtendedDays > 0 
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
           +${p.totalExtendedDays} วัน (ขยาย ${p.extensionsCount || 1} ครั้ง)
         </span>`
      : '';

    // Fine Box
    const finePerDay = p.dailyFine ? `฿${formatMoney(p.dailyFine)}/วัน` : '-';
    const accumulatedFineHtml = (p.accumulatedFine && p.accumulatedFine > 0)
      ? `<div class="mt-2.5 p-2 rounded-xl bg-rose-950/60 border border-rose-600/40 flex items-center justify-between text-xs text-rose-300">
           <span class="font-medium flex items-center gap-1"><span>⚠️</span> ค่าปรับสะสมโดยประมาณ:</span>
           <span class="font-bold text-rose-400 text-sm">฿${formatMoney(p.accumulatedFine)}</span>
         </div>`
      : '';

    // Indicators for Milestones & Documents
    const overdueMsCount = (p.overdueMilestones || []).length;
    const waitingMsCount = (p.inspectionWaitingMilestones || []).length;
    const waitingDocsCount = (p.waitingReplyDocs || []).length;

    let indicatorsHtml = '';
    if (overdueMsCount > 0 || waitingMsCount > 0 || waitingDocsCount > 0) {
      indicatorsHtml = `
        <div class="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap gap-1.5 text-[11px]">
          ${overdueMsCount > 0 ? `<span class="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/30">⚠️ งวดงานเกินกำหนด ${overdueMsCount} งวด</span>` : ''}
          ${waitingMsCount > 0 ? `<span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">⏳ รอกรรมการตรวจ ${waitingMsCount} งวด</span>` : ''}
          ${waitingDocsCount > 0 ? `<span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/30">✉️ หนังสือรอตอบ ${waitingDocsCount} ฉบับ</span>` : ''}
        </div>
      `;
    }

    return `
      <div class="glass-card project-card rounded-3xl p-5 flex flex-col justify-between ${cardClass}">
        
        <div>
          <!-- Top Row: Badge & Status -->
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="px-3 py-1 rounded-full text-xs border ${badgeClass}">
              ${escapeHtml(p.badgeText || (p.isOverdue ? `🔴 เลยกำหนด ${p.overdueDays} วัน` : `🟢 เหลือ ${p.daysRemaining} วัน`))}
            </span>
            <span class="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              ${p.contract_no ? escapeHtml(p.contract_no) : 'ไม่ระบุสัญญา'}
            </span>
          </div>

          <!-- Project Title -->
          <h3 class="text-base font-bold text-white leading-snug line-clamp-2 mb-1" title="${escapeHtml(p.name)}">
            ${escapeHtml(p.name)}
          </h3>

          <!-- Client & Contractor -->
          <div class="text-xs text-slate-400 space-y-0.5 mb-4">
            <div class="flex items-center space-x-1.5 truncate">
              <span class="text-slate-500">ผู้ว่าจ้าง:</span>
              <span class="text-slate-300 font-medium">${escapeHtml(p.client_name || '-')}</span>
            </div>
            ${p.contractor_name ? `
              <div class="flex items-center space-x-1.5 truncate">
                <span class="text-slate-500">ผู้รับจ้าง:</span>
                <span class="text-slate-300">${escapeHtml(p.contractor_name)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Timeline Box -->
          <div class="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
            <div class="flex justify-between items-center text-slate-400">
              <span>เริ่มสัญญา:</span>
              <span class="text-slate-200">${formatThaiDate(p.start_date)}</span>
            </div>
            <div class="flex justify-between items-center text-slate-400">
              <span>สิ้นสุด TOR เดิม:</span>
              <span class="text-slate-200">${formatThaiDate(p.original_end_date)}</span>
            </div>
            <div class="flex justify-between items-center border-t border-slate-800/80 pt-1.5 font-medium">
              <span class="text-amber-400 flex items-center gap-1">
                <span>สิ้นสุดปัจจุบัน:</span>
                ${extText}
              </span>
              <span class="text-white font-bold">${formatThaiDate(p.currentEndDate)}</span>
            </div>
          </div>

          <!-- Financial Details -->
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div class="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/70">
              <span class="text-slate-500 block text-[11px]">วงเงินสัญญา</span>
              <span class="font-bold text-white">${p.contract_value ? `฿${formatMoney(p.contract_value)}` : '-'}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/70">
              <span class="text-slate-500 block text-[11px]">ค่าปรับ (${p.fine_rate_percent || 0.1}%)</span>
              <span class="font-bold text-rose-400">${finePerDay}</span>
            </div>
          </div>

          <!-- Accumulated Fine Warning Box (if overdue) -->
          ${accumulatedFineHtml}

          <!-- Milestones & Document Summary Badges -->
          ${indicatorsHtml}
        </div>

        <!-- Action Buttons Footer -->
        <div class="mt-5 pt-4 border-t border-slate-800 grid grid-cols-4 gap-1.5 text-xs">
          <!-- Button + Extension -->
          <button type="button" class="btn-open-ext py-2 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-medium transition text-center col-span-1" data-id="${p.id}" title="บันทึกขอขยายอายุสัญญา">
            + ขยายเวลา
          </button>

          <!-- Button Milestones -->
          <button type="button" class="btn-open-ms py-2 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 font-medium transition text-center col-span-1" data-id="${p.id}" title="จัดการงวดงาน">
            📋 งวดงาน
          </button>

          <!-- Button Edit -->
          <button type="button" class="btn-open-edit py-2 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium transition text-center col-span-1" data-id="${p.id}" title="แก้ไขโครงการ">
            ✏️ แก้ไข
          </button>

          <!-- Button Delete -->
          <button type="button" class="btn-delete-proj py-2 px-1 rounded-xl bg-slate-800/50 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 font-medium transition text-center col-span-1" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="ลบโครงการ">
            🗑️
          </button>
        </div>

      </div>
    `;
  }).join('');

  // Attach card button listeners
  attachCardEvents();
}

function attachCardEvents() {
  document.querySelectorAll('.btn-open-ext').forEach(btn => {
    btn.addEventListener('click', () => openExtensionModal(btn.dataset.id));
  });

  document.querySelectorAll('.btn-open-ms').forEach(btn => {
    btn.addEventListener('click', () => openMilestonesModal(btn.dataset.id));
  });

  document.querySelectorAll('.btn-open-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditProjectModal(btn.dataset.id));
  });

  document.querySelectorAll('.btn-delete-proj').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteProject(btn.dataset.id, btn.dataset.name));
  });
}

// ---------- Project CRUD Operations ----------

function openAddProjectModal() {
  const form = document.getElementById('form-project');
  if (form) form.reset();
  
  document.getElementById('project-id').value = '';
  document.getElementById('modal-project-title').textContent = 'เพิ่มโครงการใหม่';
  document.getElementById('project-fine-rate').value = '0.1';
  document.getElementById('project-status').value = 'active';

  // Set default start date to today
  document.getElementById('project-start-date').value = state.today || new Date().toISOString().slice(0, 10);

  openModal('modal-project');
}

async function openEditProjectModal(id) {
  try {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    const p = data.project;

    document.getElementById('project-id').value = p.id;
    document.getElementById('modal-project-title').textContent = 'แก้ไขข้อมูลโครงการ';
    document.getElementById('project-name').value = p.name || '';
    document.getElementById('project-contract-no').value = p.contract_no || '';
    document.getElementById('project-client-name').value = p.client_name || '';
    document.getElementById('project-contractor-name').value = p.contractor_name || '';
    document.getElementById('project-start-date').value = p.start_date || '';
    document.getElementById('project-original-end-date').value = p.original_end_date || '';
    document.getElementById('project-contract-value').value = p.contract_value || '';
    document.getElementById('project-fine-rate').value = p.fine_rate_percent || 0.1;
    document.getElementById('project-status').value = p.status || 'active';
    document.getElementById('project-notes').value = p.notes || '';

    openModal('modal-project');
  } catch (err) {
    console.error('Open edit modal error:', err);
    showToast('ไม่สามารถดึงข้อมูลโครงการได้', 'error');
  }
}

async function handleProjectSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('project-id').value;
  const isEdit = Boolean(id);

  const payload = {
    name: document.getElementById('project-name').value.trim(),
    contract_no: document.getElementById('project-contract-no').value.trim(),
    client_name: document.getElementById('project-client-name').value.trim(),
    contractor_name: document.getElementById('project-contractor-name').value.trim(),
    start_date: document.getElementById('project-start-date').value,
    original_end_date: document.getElementById('project-original-end-date').value,
    contract_value: Number(document.getElementById('project-contract-value').value) || 0,
    fine_rate_percent: Number(document.getElementById('project-fine-rate').value) || 0.1,
    status: document.getElementById('project-status').value,
    notes: document.getElementById('project-notes').value.trim()
  };

  const btn = document.getElementById('btn-save-project');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  try {
    const url = isEdit ? `/api/projects/${id}` : '/api/projects';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'บันทึกไม่สำเร็จ');
    }

    closeModal('modal-project');
    showToast(isEdit ? 'แก้ไขโครงการสำเร็จ' : 'เพิ่มโครงการใหม่เรียบร้อย', 'success');
    await fetchProjects();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'บันทึกข้อมูล';
  }
}

async function handleDeleteProject(id, name) {
  if (!confirm(`คุณต้องการลบโครงการ "${name}" หรือไม่?\n\nข้อมูลการขยายเวลาและงวดงานทั้งหมดของโครงการนี้จะถูกลบถาวร`)) {
    return;
  }

  try {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('ลบไม่สำเร็จ');
    showToast('ลบโครงการเรียบร้อยแล้ว', 'info');
    await fetchProjects();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------- Contract Extension Operations ----------

async function openExtensionModal(projectId) {
  state.activeProjectId = projectId;
  const modal = document.getElementById('modal-extension');
  const form = document.getElementById('form-extension');
  form.reset();

  document.getElementById('ext-project-id').value = projectId;
  document.getElementById('ext-approved-date').value = state.today || new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) throw new Error('Failed to load project details');
    const data = await res.json();
    state.activeProjectDetail = data;
    const p = data.project;
    const extensions = data.extensions || [];

    document.getElementById('ext-modal-subtitle').textContent = `โครงการ: ${p.name}`;
    document.getElementById('ext-info-orig-end').textContent = formatThaiDate(p.original_end_date, true);
    document.getElementById('ext-info-total-added').textContent = `+${p.totalExtendedDays} วัน (${extensions.length} ครั้ง)`;
    document.getElementById('ext-info-effective-end').textContent = formatThaiDate(p.currentEndDate, true);

    renderExtensionList(extensions);
    openModal('modal-extension');
  } catch (err) {
    console.error('Error loading extensions:', err);
    showToast('โหลดข้อมูลการขยายสัญญาไม่สำเร็จ', 'error');
  }
}

function renderExtensionList(extensions) {
  const container = document.getElementById('ext-list-container');
  if (!container) return;

  if (!extensions.length) {
    container.innerHTML = '<div class="p-3 text-center text-xs text-slate-500">ไม่มีประวัติการขยายสัญญา</div>';
    return;
  }

  container.innerHTML = extensions.map(ext => `
    <div class="p-3 flex items-start justify-between gap-3 text-xs">
      <div>
        <div class="flex items-center space-x-2 font-medium">
          <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
            ครั้งที่ ${ext.extension_no}: +${ext.days_added} วัน
          </span>
          <span class="text-slate-300 font-semibold">${escapeHtml(ext.reason)}</span>
        </div>
        <div class="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
          ${ext.doc_ref ? `<span>📄 หนังสือ: ${escapeHtml(ext.doc_ref)}</span>` : ''}
          <span>📅 อนุมัติเมื่อ: ${formatThaiDate(ext.approved_date)}</span>
        </div>
      </div>
      <button type="button" class="btn-del-ext text-slate-500 hover:text-rose-400 p-1 rounded transition" data-id="${ext.id}" title="ลบรายการขยายนี้">
        ✕
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-del-ext').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteExtension(btn.dataset.id));
  });
}

async function handleExtensionSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('ext-project-id').value;
  const daysAdded = document.getElementById('ext-days-added').value;
  const reason = document.getElementById('ext-reason').value.trim();
  const docRef = document.getElementById('ext-doc-ref').value.trim();
  const approvedDate = document.getElementById('ext-approved-date').value;

  const btn = document.getElementById('btn-save-extension');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  try {
    const res = await fetch(`/api/projects/${projectId}/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        days_added: daysAdded,
        reason,
        doc_ref: docRef,
        approved_date: approvedDate
      })
    });

    if (!res.ok) throw new Error('บันทึกการขยายเวลาไม่สำเร็จ');

    showToast(`ขยายอายุสัญญาเพิ่ม ${daysAdded} วัน เรียบร้อยแล้ว`, 'success');
    closeModal('modal-extension');
    await fetchProjects();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'บันทึกการขยายเวลา';
  }
}

async function handleDeleteExtension(extId) {
  if (!confirm('ต้องการลบรายการขยายเวลานี้หรือไม่? วันสิ้นสุดสัญญาจะถูกคำนวณใหม่')) return;

  try {
    const res = await fetch(`/api/extensions/${extId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('ลบไม่สำเร็จ');
    showToast('ลบรายการขยายเวลาเรียบร้อย', 'info');
    if (state.activeProjectId) {
      await openExtensionModal(state.activeProjectId);
    }
    await fetchProjects();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------- Milestones Operations ----------

async function openMilestonesModal(projectId) {
  state.activeProjectId = projectId;
  const form = document.getElementById('form-milestone');
  form.reset();

  document.getElementById('ms-project-id').value = projectId;
  document.getElementById('ms-target-date').value = state.today || new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) throw new Error('Failed to load project details');
    const data = await res.json();
    state.activeProjectDetail = data;
    const p = data.project;
    const milestones = data.milestones || [];

    document.getElementById('ms-modal-subtitle').textContent = `โครงการ: ${p.name}`;
    document.getElementById('ms-summary-badge').textContent = `${milestones.length} งวด`;
    document.getElementById('ms-no').value = (milestones.length || 0) + 1;

    renderMilestonesList(milestones, projectId);
    openModal('modal-milestones');
  } catch (err) {
    console.error('Error loading milestones:', err);
    showToast('โหลดข้อมูลรายงวดงานไม่สำเร็จ', 'error');
  }
}

function renderMilestonesList(milestones, projectId) {
  const container = document.getElementById('ms-list-container');
  if (!container) return;

  if (!milestones.length) {
    container.innerHTML = '<div class="p-4 text-center text-xs text-slate-500">ยังไม่มีข้อมูลรายการงวดงาน</div>';
    return;
  }

  const statusMap = {
    pending: { label: 'รอส่งมอบ', color: 'bg-slate-800 text-slate-300 border-slate-700' },
    submitted: { label: 'ยื่นตรวจแล้ว', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    approved: { label: 'ตรวจรับแล้ว', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    paid: { label: 'เบิกจ่ายแล้ว', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' }
  };

  container.innerHTML = milestones.map(m => {
    const st = statusMap[m.status] || statusMap.pending;
    return `
      <div class="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div class="flex-1">
          <div class="flex items-center space-x-2 font-medium">
            <span class="font-bold text-white bg-slate-800 px-2 py-0.5 rounded">งวดที่ ${m.milestone_no}</span>
            <span class="text-slate-200">${escapeHtml(m.title)}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
            <span>💰 ฿${formatMoney(m.amount)}</span>
            <span>📅 กำหนดส่ง: ${formatThaiDate(m.target_date)}</span>
            ${m.submitted_date ? `<span>🚀 ยื่นเมื่อ: ${formatThaiDate(m.submitted_date)}</span>` : ''}
          </div>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <!-- Quick Status Select -->
          <select class="ms-status-select bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1" data-id="${m.id}" data-project="${projectId}">
            <option value="pending" ${m.status === 'pending' ? 'selected' : ''}>รอส่งมอบ</option>
            <option value="submitted" ${m.status === 'submitted' ? 'selected' : ''}>ยื่นตรวจแล้ว</option>
            <option value="approved" ${m.status === 'approved' ? 'selected' : ''}>ตรวจรับแล้ว</option>
            <option value="paid" ${m.status === 'paid' ? 'selected' : ''}>เบิกจ่ายแล้ว</option>
          </select>

          <!-- Delete Milestone -->
          <button type="button" class="btn-del-ms text-slate-500 hover:text-rose-400 p-1 rounded transition" data-id="${m.id}" title="ลบงวดงานนี้">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.ms-status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const msId = e.target.dataset.id;
      const targetStatus = e.target.value;
      await handleUpdateMilestoneStatus(msId, targetStatus);
    });
  });

  container.querySelectorAll('.btn-del-ms').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteMilestone(btn.dataset.id));
  });
}

async function handleMilestoneSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('ms-project-id').value;
  const no = document.getElementById('ms-no').value;
  const title = document.getElementById('ms-title').value.trim();
  const amount = document.getElementById('ms-amount').value;
  const targetDate = document.getElementById('ms-target-date').value;
  const status = document.getElementById('ms-status').value;

  const btn = document.getElementById('btn-save-milestone');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  try {
    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        milestone_no: no,
        title,
        amount: Number(amount) || 0,
        target_date: targetDate,
        status
      })
    });

    if (!res.ok) throw new Error('เพิ่มงวดงานไม่สำเร็จ');

    showToast(`เพิ่มงวดที่ ${no} เรียบร้อยแล้ว`, 'success');
    document.getElementById('form-milestone').reset();
    await openMilestonesModal(projectId);
    await fetchProjects();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'เพิ่มงวดงาน';
  }
}

async function handleUpdateMilestoneStatus(msId, newStatus) {
  try {
    const res = await fetch(`/api/milestones/${msId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        submitted_date: newStatus === 'submitted' ? state.today : null
      })
    });

    if (!res.ok) throw new Error('อัปเดตสถานะงวดงานไม่สำเร็จ');
    showToast('ปรับสถานะงวดงานเรียบร้อย', 'success');
    await fetchProjects();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteMilestone(msId) {
  if (!confirm('ต้องการลบงวดงานนี้หรือไม่?')) return;

  try {
    const res = await fetch(`/api/milestones/${msId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('ลบไม่สำเร็จ');
    showToast('ลบงวดงานเรียบร้อย', 'info');
    if (state.activeProjectId) {
      await openMilestonesModal(state.activeProjectId);
    }
    await fetchProjects();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------- LINE Digest Preview & Manual Trigger ----------

async function openDigestPreviewModal() {
  const contentEl = document.getElementById('digest-preview-content');
  contentEl.textContent = 'กำลังประมวลผลข้อความสรุปประจำเช้า...';
  openModal('modal-digest');

  try {
    const res = await fetch('/api/digest/preview');
    if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลพรีวิวได้');
    const data = await res.json();
    
    if (!data.digest || data.digest.trim() === '') {
      contentEl.textContent = '✅ ไม่มีโครงการใดที่ต้องแจ้งเตือนวันนี้ (ทุกโครงการเป็นปกติ หรือไม่มีโครงการค้างดำเนินการ)';
    } else {
      contentEl.textContent = data.digest;
    }
  } catch (err) {
    contentEl.textContent = '⚠️ เกิดข้อผิดพลาดในการสร้างพรีวิว: ' + err.message;
  }
}

async function sendDigestNow() {
  const btn = document.getElementById('btn-send-digest-now');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span><span>กำลังส่งข้อความ...</span>';

  try {
    const res = await fetch('/api/digest/send', { method: 'POST' });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'ส่งข้อความไม่สำเร็จ');

    if (data.recipients_count === 0) {
      showToast('ยังไม่มีผู้รับแจ้งเตือนที่ลงทะเบียนในระบบ กรุณากดปุ่ม "ลงทะเบียนแจ้งเตือน" ก่อน', 'info');
    } else {
      showToast(`ส่งข้อความแจ้งเตือนเข้า LINE สำเร็จ (${data.recipients_count} ผู้รับ)`, 'success');
      closeModal('modal-digest');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🚀</span><span>ส่งเข้า LINE ทันที</span>';
  }
}

function copyDigestToClipboard() {
  const content = document.getElementById('digest-preview-content').textContent;
  if (!content) return;

  navigator.clipboard.writeText(content).then(() => {
    showToast('คัดลอกข้อความสรุปแล้ว พร้อมวางลงในกลุ่ม LINE', 'success');
  }).catch(() => {
    showToast('ไม่สามารถคัดลอกอัตโนมัติได้', 'error');
  });
}

// ---------- LINE Registration & LIFF ----------

async function openLineRegisterModal() {
  openModal('modal-register');
  await Promise.all([loadLineSettings(), loadLineRecipients()]);
}

async function loadLineSettings() {
  try {
    const res = await fetch('/api/settings/line');
    if (!res.ok) return;
    const data = await res.json();
    const statusEl = document.getElementById('line-token-status');
    const webhookEl = document.getElementById('setting-webhook-url');
    if (webhookEl && data.webhook_url) {
      webhookEl.value = data.webhook_url;
    }
    if (statusEl) {
      if (data.has_token) {
        statusEl.className = 'px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800';
        statusEl.textContent = '✓ มี Token แล้ว (' + (data.token_masked || '') + ')';
      } else {
        statusEl.className = 'px-2 py-0.5 rounded-full text-[10px] bg-amber-950 text-amber-400 border border-amber-800';
        statusEl.textContent = 'ยังไม่ได้ใส่ Token';
      }
    }
  } catch (e) {
    console.error('Error loading LINE settings:', e);
  }
}

async function saveLineSettings() {
  const tokenInput = document.getElementById('setting-line-token');
  const token = (tokenInput?.value || '').trim();
  if (!token) {
    showToast('กรุณากรอก Channel Access Token', 'error');
    return;
  }
  try {
    const res = await fetch('/api/settings/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('บันทึก Channel Access Token สำเร็จแล้ว!', 'success');
      tokenInput.value = '';
      await loadLineSettings();
    } else {
      showToast(data.error || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
  }
}

async function loadLineRecipients() {
  const listEl = document.getElementById('recipients-list');
  if (!listEl) return;

  try {
    const res = await fetch('/api/line/recipients');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.recipients = data.recipients || [];

    if (!state.recipients.length) {
      listEl.innerHTML = '<div class="p-3 text-center text-slate-500">ยังไม่มีผู้รับลงทะเบียนในระบบ</div>';
      return;
    }

    listEl.innerHTML = state.recipients.map(r => `
      <div class="p-2.5 flex items-center justify-between text-xs">
        <div>
          <div class="font-medium text-slate-200 flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full ${r.is_active ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
            <span>${escapeHtml(r.display_name || 'ผู้รับ LINE')}</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">${r.target_type || 'user'}</span>
          </div>
          <div class="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[200px]">
            ${escapeHtml(r.target_id)}
          </div>
        </div>
        <button type="button" class="btn-del-recipient text-slate-500 hover:text-rose-400 p-1" data-id="${r.id}" title="ลบผู้รับ">
          ✕
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.btn-del-recipient').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteRecipient(btn.dataset.id));
    });

  } catch (err) {
    listEl.innerHTML = '<div class="p-3 text-center text-rose-400">โหลดรายชื่อไม่สำเร็จ</div>';
  }
}

async function handleRegisterRecipient(targetId, displayName, targetType = 'user') {
  if (!targetId) {
    showToast('กรุณาระบุ Target ID', 'error');
    return;
  }

  try {
    const res = await fetch('/api/line/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_id: targetId,
        display_name: displayName,
        target_type: targetType
      })
    });

    if (!res.ok) throw new Error('ลงทะเบียนไม่สำเร็จ');
    showToast(`ลงทะเบียนผู้รับ "${displayName || targetId}" เรียบร้อย`, 'success');
    await loadLineRecipients();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteRecipient(id) {
  if (!confirm('ต้องการลบผู้รับการแจ้งเตือนนี้หรือไม่?')) return;

  try {
    const res = await fetch(`/api/line/recipients/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('ลบไม่สำเร็จ');
    showToast('ลบผู้รับเรียบร้อย', 'info');
    await loadLineRecipients();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// LIFF Initialization Engine
async function initLiff() {
  if (typeof liff === 'undefined') {
    console.log('LIFF SDK not available or offline.');
    return;
  }

  // Check URL params for liffId or default
  const urlParams = new URLSearchParams(window.location.search);
  const liffId = urlParams.get('liffId') || window.__LIFF_ID__;

  if (!liffId) {
    console.log('LIFF ID not configured. Running in standard Web Browser Mode.');
    return;
  }

  try {
    await liff.init({ liffId });
    if (liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      state.liffProfile = profile;

      // Update Header Badge
      const userBadge = document.getElementById('liff-user-badge');
      const userNameEl = document.getElementById('liff-user-name');
      const userAvatarEl = document.getElementById('liff-user-avatar');

      if (userBadge && userNameEl) {
        userBadge.classList.remove('hidden');
        userBadge.classList.add('flex');
        userNameEl.textContent = profile.displayName || 'LINE User';
        if (profile.pictureUrl && userAvatarEl) {
          userAvatarEl.src = profile.pictureUrl;
          userAvatarEl.classList.remove('hidden');
        }
      }

      // Update Modal Registration Box
      const regBox = document.getElementById('liff-quick-box');
      const regName = document.getElementById('liff-reg-name');
      const regId = document.getElementById('liff-reg-id');
      const regAvatar = document.getElementById('liff-reg-avatar');

      if (regBox && regName) {
        regBox.classList.remove('hidden');
        regName.textContent = profile.displayName;
        if (regId) regId.textContent = `User ID: ${profile.userId}`;
        if (profile.pictureUrl && regAvatar) {
          regAvatar.src = profile.pictureUrl;
          regAvatar.classList.remove('hidden');
        }
      }
    }
  } catch (err) {
    console.warn('LIFF init skipped or error:', err.message);
  }
}

// ---------- Event Listeners Setup ----------

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial Data Fetch & LIFF Init
  fetchProjects();
  initLiff();

  // 2. Refresh Buttons
  document.getElementById('btn-refresh')?.addEventListener('click', fetchProjects);
  document.getElementById('btn-refresh-mobile')?.addEventListener('click', fetchProjects);

  // 3. Search Bar
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderDashboard();
    });
  }

  // 4. Filter Tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => {
        t.classList.remove('bg-amber-500', 'text-slate-950', 'shadow-sm');
        t.classList.add('bg-slate-900', 'text-slate-300', 'border', 'border-slate-800');
      });

      tab.classList.remove('bg-slate-900', 'text-slate-300', 'border', 'border-slate-800');
      tab.classList.add('bg-amber-500', 'text-slate-950', 'shadow-sm');

      state.currentFilter = tab.dataset.filter;
      renderDashboard();
    });
  });

  // 5. Action Bar Buttons
  document.getElementById('btn-add-project')?.addEventListener('click', openAddProjectModal);
  document.getElementById('btn-empty-add')?.addEventListener('click', openAddProjectModal);
  document.getElementById('btn-preview-digest')?.addEventListener('click', openDigestPreviewModal);
  document.getElementById('btn-line-register')?.addEventListener('click', openLineRegisterModal);

  // 6. Modal Close Buttons (✕ & Cancel)
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) closeModal(target);
    });
  });

  // Close modal when clicking on backdrop
  ['modal-project', 'modal-extension', 'modal-milestones', 'modal-digest', 'modal-register'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) closeModal(id);
      });
    }
  });

  // 7. Form Submissions
  document.getElementById('form-project')?.addEventListener('submit', handleProjectSubmit);
  document.getElementById('form-extension')?.addEventListener('submit', handleExtensionSubmit);
  document.getElementById('form-milestone')?.addEventListener('submit', handleMilestoneSubmit);
  
  // 8. Digest Actions
  document.getElementById('btn-copy-digest')?.addEventListener('click', copyDigestToClipboard);
  document.getElementById('btn-send-digest-now')?.addEventListener('click', sendDigestNow);

  // 9. LINE Registration Form
  document.getElementById('form-register-line')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const targetId = document.getElementById('reg-target-id').value.trim();
    const displayName = document.getElementById('reg-display-name').value.trim() || 'LINE User';
    const targetType = targetId.startsWith('C') || targetId.startsWith('R') ? 'group' : 'user';
    handleRegisterRecipient(targetId, displayName, targetType);
  });

  // 10. LIFF Auto Register Button
  document.getElementById('btn-liff-auto-register')?.addEventListener('click', () => {
    if (state.liffProfile?.userId) {
      handleRegisterRecipient(state.liffProfile.userId, state.liffProfile.displayName, 'user');
    } else {
      showToast('ไม่พบข้อมูล Profile ของ LINE', 'error');
    }
  });

  // 11. LINE Token Settings
  document.getElementById('btn-save-line-token')?.addEventListener('click', saveLineSettings);
  document.getElementById('btn-copy-webhook')?.addEventListener('click', () => {
    const url = document.getElementById('setting-webhook-url')?.value;
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('คัดลอก Webhook URL เรียบร้อยแล้ว', 'success');
      });
    }
  });
});
