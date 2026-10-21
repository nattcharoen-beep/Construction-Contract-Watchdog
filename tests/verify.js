// ==============================================================================
// 🧪 Construction Contract Watchdog — Test & Verification Script
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeProjectMetrics, buildMorningDigest, todayISO, addDays, daysBetween, formatThaiDate, formatMoney } from '../src/logic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🏗️ Running Construction Contract Watchdog Verification...\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failCount++;
  }
}

// 1. Verify Logic Engine
console.log('--- 1. Testing Business Logic & Calculations ---');
const today = todayISO();
assert(today.match(/^\d{4}-\d{2}-\d{2}$/), `todayISO returns valid YYYY-MM-DD: ${today}`);

const addedDate = addDays('2026-10-01', 30);
assert(addedDate === '2026-10-31', `addDays('2026-10-01', 30) = ${addedDate}`);

const diffDays = daysBetween('2026-10-01', '2026-10-21');
assert(diffDays === 20, `daysBetween('2026-10-01', '2026-10-21') = ${diffDays}`);

const thaiDateShort = formatThaiDate('2026-10-21');
assert(thaiDateShort.includes('21 ต.ค.'), `formatThaiDate short format: ${thaiDateShort}`);

const moneyStr = formatMoney(1500000);
assert(moneyStr === '1,500,000', `formatMoney(1500000) = ${moneyStr}`);

// Test Metrics Calculation
const sampleProject = {
  id: 1,
  name: 'งานก่อสร้างอาคารทดสอบ',
  contract_no: '01/2569',
  client_name: 'เทศบาลทดสอบ',
  contractor_name: 'บลูเคอร์',
  start_date: '2026-01-01',
  original_end_date: '2026-09-30', // passed
  contract_value: 2000000,
  fine_rate_percent: 0.1,
  status: 'active'
};

const extensions = [
  { id: 1, project_id: 1, extension_no: 1, days_added: 15, reason: 'ฝนตกหนัก' }
];

const metrics = computeProjectMetrics(sampleProject, extensions, [], [], '2026-10-21');
assert(metrics.totalExtendedDays === 15, 'Total extended days calculated properly');
assert(metrics.currentEndDate === '2026-10-15', `Current end date properly extended to 2026-10-15 (was ${metrics.currentEndDate})`);
assert(metrics.isOverdue === true, 'Identified as overdue');
assert(metrics.overdueDays === 6, `Overdue days = 6 (was ${metrics.overdueDays})`);
assert(metrics.dailyFine === 2000, `Daily fine = 2000 (was ${metrics.dailyFine})`);
assert(metrics.accumulatedFine === 12000, `Accumulated fine = 12,000 (was ${metrics.accumulatedFine})`);
assert(metrics.severity === 'crit', `Severity is crit`);

const digest = buildMorningDigest([metrics], '2026-10-21', 'https://watchdog.example.com');
assert(digest.includes('🚨 สัญญาเลยกำหนด') || digest.includes('เลยกำหนดมาแล้ว'), 'Morning digest highlights overdue section');
assert(digest.includes('12,000'), 'Morning digest includes accrued fine');

// 2. Verify Frontend Files Exist
console.log('\n--- 2. Verifying Frontend Static Files ---');
const htmlPath = path.join(rootDir, 'public', 'index.html');
const cssPath = path.join(rootDir, 'public', 'style.css');
const jsPath = path.join(rootDir, 'public', 'app.js');

assert(fs.existsSync(htmlPath), 'public/index.html exists');
assert(fs.existsSync(cssPath), 'public/style.css exists');
assert(fs.existsSync(jsPath), 'public/app.js exists');

// 3. Inspect public/index.html Contents
console.log('\n--- 3. Verifying public/index.html Structure ---');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
assert(htmlContent.includes('tailwindcss.com'), 'Tailwind CSS included');
assert(htmlContent.includes('Prompt') || htmlContent.includes('Sarabun'), 'Thai font included');
assert(htmlContent.includes('static.line-scdn.net/liff/edge/2/sdk.js'), 'LINE LIFF SDK included');
assert(htmlContent.includes('Construction Contract Watchdog'), 'System Title exists');
assert(htmlContent.includes('kpi-crit-count'), 'Overdue KPI stat element exists');
assert(htmlContent.includes('kpi-warn-count'), 'Warning KPI stat element exists');
assert(htmlContent.includes('kpi-safe-count'), 'Safe KPI stat element exists');
assert(htmlContent.includes('kpi-total-fine'), 'Total Fine KPI stat element exists');
assert(htmlContent.includes('btn-add-project'), 'Add Project button exists');
assert(htmlContent.includes('btn-preview-digest'), 'LINE Preview button exists');
assert(htmlContent.includes('btn-line-register'), 'LINE Register button exists');
assert(htmlContent.includes('modal-project'), 'Add/Edit Project Modal exists');
assert(htmlContent.includes('modal-extension'), 'Contract Extension Modal exists');
assert(htmlContent.includes('modal-milestones'), 'Milestones Modal exists');
assert(htmlContent.includes('modal-digest'), 'LINE Digest Preview Modal exists');
assert(htmlContent.includes('modal-register'), 'LINE Register Modal exists');

// 4. Inspect public/app.js Contents
console.log('\n--- 4. Verifying public/app.js Implementation ---');
const jsContent = fs.readFileSync(jsPath, 'utf8');
assert(jsContent.includes('/api/projects'), 'Calls /api/projects API');
assert(jsContent.includes('/api/digest/preview'), 'Calls /api/digest/preview API');
assert(jsContent.includes('/api/digest/send'), 'Calls /api/digest/send API');
assert(jsContent.includes('/api/projects/${projectId}/extensions') || jsContent.includes('/extensions'), 'Handles extensions API');
assert(jsContent.includes('/api/projects/${projectId}/milestones') || jsContent.includes('/milestones'), 'Handles milestones API');
assert(jsContent.includes('initLiff'), 'LIFF initialization function implemented');
assert(jsContent.includes('formatThaiDate'), 'Thai date formatter implemented');
assert(jsContent.includes('formatMoney'), 'Money formatter implemented');

// 5. Inspect public/style.css Contents
console.log('\n--- 5. Verifying public/style.css Styling ---');
const cssContent = fs.readFileSync(cssPath, 'utf8');
assert(cssContent.includes('pulse-critical') || cssContent.includes('badge-pulse'), 'Pulsing critical animation defined');
assert(cssContent.includes('glass-modal') || cssContent.includes('glass-card'), 'Modern glass card styling defined');
assert(cssContent.includes('safe-bottom'), 'Mobile LIFF safe-area padding defined');

console.log(`\n==============================================`);
console.log(`Summary: ${passCount} PASSED, ${failCount} FAILED`);
console.log(`==============================================\n`);

if (failCount > 0) {
  process.exit(1);
}
