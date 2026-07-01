#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'jobs.json');
const STATUS_ORDER = ['scheduled', 'in-progress', 'completed', 'invoiced', 'paid'];

const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';
const STATUS_COLORS = {
  scheduled:    '\x1b[34m',
  'in-progress':'\x1b[33m',
  completed:    '\x1b[36m',
  invoiced:     '\x1b[35m',
  paid:         '\x1b[32m',
};

function colorStatus(status) {
  return `${STATUS_COLORS[status] || ''}${status}${RESET}`;
}

function loadJobs() {
  if (!fs.existsSync(DATA_FILE)) return { jobs: [] };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveJobs(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function makeAsker() {
  const rl     = readline.createInterface({ input: process.stdin, terminal: false });
  const queue  = [];
  let pending  = null;
  rl.on('line',  line => { if (pending) { const r = pending; pending = null; r(line.trim()); } else queue.push(line.trim()); });
  rl.on('close', ()   => { if (pending) { pending(''); } });
  function ask(prompt) {
    process.stdout.write(prompt);
    return new Promise(r => { if (queue.length) r(queue.shift()); else pending = r; });
  }
  function close() { rl.close(); }
  return { ask, close };
}

async function addJob() {
  const { ask, close } = makeAsker();
  console.log(`\n${BOLD}--- Add New Job ---${RESET}\n`);

  const client        = await ask('Client name:              ');
  const address       = await ask('Address:                  ');
  const jobType       = await ask('Job type:                 ');
  const scheduledDate = await ask('Scheduled date (YYYY-MM-DD): ');
  const priceStr      = await ask('Price ($):                ');
  const notes         = await ask('Notes (optional):         ');
  close();

  const price = parseFloat(priceStr);
  if (isNaN(price) || price < 0) {
    console.error('Invalid price — must be a non-negative number.');
    process.exit(1);
  }
  if (!client || !address || !jobType || !scheduledDate) {
    console.error('Client, address, job type, and date are required.');
    process.exit(1);
  }

  const data = loadJobs();
  const job = {
    id: generateId(),
    client,
    address,
    jobType,
    scheduledDate,
    price,
    notes,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  };
  data.jobs.push(job);
  saveJobs(data);

  console.log(`\nJob added!  ID: ${BOLD}${job.id}${RESET}  |  ${job.client} — ${job.jobType}  |  $${price.toFixed(2)}\n`);
}

function listJobs(statusFilter) {
  if (statusFilter && !STATUS_ORDER.includes(statusFilter)) {
    console.error(`Unknown status "${statusFilter}". Valid: ${STATUS_ORDER.join(', ')}`);
    process.exit(1);
  }

  const data = loadJobs();
  const jobs = statusFilter ? data.jobs.filter(j => j.status === statusFilter) : data.jobs;

  if (jobs.length === 0) {
    console.log(statusFilter ? `No jobs with status "${statusFilter}".` : 'No jobs on file.');
    return;
  }

  const W = 70;
  console.log(`\n${'─'.repeat(W)}`);
  console.log(`${BOLD}PROFIX JOBS${statusFilter ? `  [${statusFilter.toUpperCase()}]` : ''}${RESET}`);
  console.log(`${'─'.repeat(W)}`);

  for (const job of jobs) {
    console.log(`\n  ${BOLD}[${job.id}]${RESET}  ${job.client}  —  ${job.jobType}`);
    console.log(`    Address:  ${job.address}`);
    console.log(`    Date:     ${job.scheduledDate}`);
    console.log(`    Price:    $${job.price.toFixed(2)}`);
    console.log(`    Status:   ${colorStatus(job.status)}`);
    if (job.notes) console.log(`    Notes:    ${job.notes}`);
  }

  console.log(`\n${'─'.repeat(W)}`);
  console.log(`  ${jobs.length} job(s) shown\n`);
}

function updateJob(id) {
  const data = loadJobs();
  const job  = data.jobs.find(j => j.id === id);
  if (!job) { console.error(`Job not found: ${id}`); process.exit(1); }

  const idx = STATUS_ORDER.indexOf(job.status);
  if (idx === STATUS_ORDER.length - 1) {
    console.log(`Job ${BOLD}${id}${RESET} is already at final status: ${colorStatus(job.status)}`);
    return;
  }

  const prev = job.status;
  job.status = STATUS_ORDER[idx + 1];
  if (job.status === 'invoiced') job.invoicedAt = new Date().toISOString();
  if (job.status === 'paid')     job.paidAt     = new Date().toISOString();

  saveJobs(data);
  console.log(`\nJob ${BOLD}${id}${RESET}  (${job.client}):  ${colorStatus(prev)} → ${colorStatus(job.status)}\n`);
}

function printInvoice(id) {
  const data = loadJobs();
  const job  = data.jobs.find(j => j.id === id);
  if (!job) { console.error(`Job not found: ${id}`); process.exit(1); }

  const W    = 54;
  const dbl  = '═'.repeat(W);
  const sng  = '─'.repeat(W);
  const row  = (text) => `║ ${text.padEnd(W - 1)}║`;
  const sep  = `╠${dbl}╣`;

  console.log(`\n╔${dbl}╗`);
  console.log(row('  PROFIX HOME SERVICES'));
  console.log(row('  INVOICE'));
  console.log(sep);
  console.log(row(`  Invoice #:  ${job.id}`));
  console.log(row(`  Date:       ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}`));
  console.log(sep);
  console.log(row('  BILL TO'));
  console.log(row(`  ${job.client}`));
  console.log(row(`  ${job.address}`));
  console.log(sep);
  console.log(row('  SERVICE DETAILS'));
  console.log(`║ ${sng}║`);
  console.log(row(`  Job Type:   ${job.jobType}`));
  console.log(row(`  Scheduled:  ${job.scheduledDate}`));
  console.log(row(`  Status:     ${job.status}`));
  if (job.notes) console.log(row(`  Notes:      ${job.notes}`));
  console.log(sep);
  console.log(row(`  AMOUNT DUE:  $${job.price.toFixed(2)}`));
  console.log(`╚${dbl}╝\n`);
}

function showRevenue() {
  const data        = loadJobs();
  const { jobs }    = data;

  const paid        = jobs.filter(j => j.status === 'paid');
  const outstanding = jobs.filter(j => ['invoiced', 'completed'].includes(j.status));
  const pipeline    = jobs.filter(j => ['scheduled', 'in-progress'].includes(j.status));

  const sum = arr => arr.reduce((acc, j) => acc + j.price, 0);
  const fmt = (n) => `$${n.toFixed(2)}`;
  const row = (label, color, arr) =>
    `  ${color}${label.padEnd(28)}${RESET}${fmt(sum(arr)).padStart(12)}   (${arr.length} job${arr.length !== 1 ? 's' : ''})`;

  const total = sum(paid) + sum(outstanding) + sum(pipeline);

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`${BOLD}  PROFIX REVENUE SUMMARY${RESET}`);
  console.log(`${'═'.repeat(50)}`);
  console.log(row('Collected (paid)',     '\x1b[32m', paid));
  console.log(row('Outstanding',          '\x1b[35m', outstanding));
  console.log(row('Open Pipeline',        '\x1b[34m', pipeline));
  console.log(`${'─'.repeat(50)}`);
  console.log(`  ${BOLD}Total Business Value${RESET}         ${fmt(total).padStart(12)}`);
  console.log(`${'═'.repeat(50)}\n`);
}

function deleteJob(id) {
  const data  = loadJobs();
  const index = data.jobs.findIndex(j => j.id === id);
  if (index === -1) { console.error(`Job not found: ${id}`); process.exit(1); }

  const [job] = data.jobs.splice(index, 1);
  saveJobs(data);
  console.log(`\nDeleted job ${BOLD}${id}${RESET}  —  ${job.client} (${job.jobType})\n`);
}

function showHelp() {
  console.log(`
${BOLD}ProFix Home Services — Job Manager${RESET}

  Usage: node profix.js <command> [args]

  ${BOLD}Commands:${RESET}
    add                  Add a new job (interactive prompts)
    list [status]        List all jobs; optionally filter by status
    update <id>          Advance job to next status
    invoice <id>         Print a plain-text invoice
    revenue              Show collected / outstanding / pipeline totals
    delete <id>          Remove a job permanently

  ${BOLD}Status flow:${RESET}
    scheduled → in-progress → completed → invoiced → paid
`);
}

async function main() {
  const [,, command, arg] = process.argv;
  switch (command) {
    case 'add':     await addJob();        break;
    case 'list':    listJobs(arg);         break;
    case 'update':
      if (!arg) { console.error('Usage: node profix.js update <id>'); process.exit(1); }
      updateJob(arg);
      break;
    case 'invoice':
      if (!arg) { console.error('Usage: node profix.js invoice <id>'); process.exit(1); }
      printInvoice(arg);
      break;
    case 'revenue': showRevenue();         break;
    case 'delete':
      if (!arg) { console.error('Usage: node profix.js delete <id>'); process.exit(1); }
      deleteJob(arg);
      break;
    default:        showHelp();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
