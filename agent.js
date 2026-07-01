#!/usr/bin/env node

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const crypto = require('crypto');

const PORT      = 3000;
const DATA_FILE = path.join(__dirname, 'jobs.json');
const DASHBOARD = path.join(__dirname, 'dashboard.html');
const STATUS_ORDER = ['estimate', 'scheduled', 'completed', 'paid'];

function loadJobs() {
  if (!fs.existsSync(DATA_FILE)) return { jobs: [] };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveJobs(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Validates a line-items payload. Returns a cleaned array, or null if invalid.
function validateLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;
  const cleaned = [];
  for (const item of lineItems) {
    if (!item || typeof item.description !== 'string' || !item.description.trim()) return null;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount < 0) return null;
    cleaned.push({ description: item.description.trim(), amount });
  }
  return cleaned;
}

function calcRevenue(jobs) {
  const paid        = jobs.filter(j => j.status === 'paid');
  const outstanding = jobs.filter(j => j.status === 'completed');
  const pipeline     = jobs.filter(j => ['estimate', 'scheduled'].includes(j.status));
  const sum = arr => arr.reduce((a, j) => a + j.price, 0);
  return {
    collected:   { amount: sum(paid),        count: paid.length },
    outstanding: { amount: sum(outstanding), count: outstanding.length },
    pipeline:    { amount: sum(pipeline),    count: pipeline.length },
    total:       sum(paid) + sum(outstanding) + sum(pipeline),
  };
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);

  if (pathname === '/' || pathname === '/dashboard.html') {
    fs.readFile(DASHBOARD, (err, data) => {
      if (err) { res.writeHead(404); res.end('dashboard.html not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname === '/api/jobs' && req.method === 'GET') {
    const { jobs } = loadJobs();
    json(res, jobs);
    return;
  }

  if (pathname === '/api/jobs' && req.method === 'POST') {
    readBody(req).then(body => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        json(res, { error: 'Invalid JSON body' }, 400);
        return;
      }

      const { client, phone, address, jobType, scheduledDate, status, lineItems } = payload;
      if (!client || !address || !jobType || !scheduledDate) {
        json(res, { error: 'client, address, jobType, and scheduledDate are required' }, 400);
        return;
      }
      if (status !== undefined && !STATUS_ORDER.includes(status)) {
        json(res, { error: `status must be one of: ${STATUS_ORDER.join(', ')}` }, 400);
        return;
      }
      const cleanedLineItems = validateLineItems(lineItems);
      if (!cleanedLineItems) {
        json(res, { error: 'At least one line item with a description and non-negative amount is required' }, 400);
        return;
      }

      const price = cleanedLineItems.reduce((a, i) => a + i.amount, 0);

      const data = loadJobs();
      const job = {
        id: crypto.randomBytes(4).toString('hex'),
        client,
        phone: phone || '',
        address,
        jobType,
        scheduledDate,
        lineItems: cleanedLineItems,
        price,
        notes: '',
        status: status || 'estimate',
        createdAt: new Date().toISOString(),
      };
      data.jobs.push(job);
      saveJobs(data);
      json(res, job, 201);
    }).catch(() => {
      json(res, { error: 'Failed to read request body' }, 500);
    });
    return;
  }

  const jobIdMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);

  if (jobIdMatch && req.method === 'PUT') {
    const id = jobIdMatch[1];
    readBody(req).then(body => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        json(res, { error: 'Invalid JSON body' }, 400);
        return;
      }

      const data = loadJobs();
      const job = data.jobs.find(j => j.id === id);
      if (!job) { json(res, { error: `Job not found: ${id}` }, 404); return; }

      const { client, phone, jobType, scheduledDate, status, address, notes, lineItems } = payload;

      if (lineItems !== undefined) {
        const cleanedLineItems = validateLineItems(lineItems);
        if (!cleanedLineItems) {
          json(res, { error: 'At least one line item with a description and non-negative amount is required' }, 400);
          return;
        }
        job.lineItems = cleanedLineItems;
        job.price = cleanedLineItems.reduce((a, i) => a + i.amount, 0);
      }
      if (status !== undefined) {
        if (!STATUS_ORDER.includes(status)) {
          json(res, { error: `status must be one of: ${STATUS_ORDER.join(', ')}` }, 400);
          return;
        }
        job.status = status;
        if (status === 'completed') job.completedAt = new Date().toISOString();
        if (status === 'paid')      job.paidAt      = new Date().toISOString();
      }
      if (client        !== undefined) job.client        = client;
      if (phone         !== undefined) job.phone         = phone;
      if (jobType       !== undefined) job.jobType       = jobType;
      if (scheduledDate !== undefined) job.scheduledDate = scheduledDate;
      if (address       !== undefined) job.address       = address;
      if (notes         !== undefined) job.notes         = notes;

      saveJobs(data);
      json(res, job);
    }).catch(() => {
      json(res, { error: 'Failed to read request body' }, 500);
    });
    return;
  }

  if (jobIdMatch && req.method === 'DELETE') {
    const id = jobIdMatch[1];
    const data  = loadJobs();
    const index = data.jobs.findIndex(j => j.id === id);
    if (index === -1) { json(res, { error: `Job not found: ${id}` }, 404); return; }

    const [job] = data.jobs.splice(index, 1);
    saveJobs(data);
    json(res, job);
    return;
  }

  if (pathname === '/api/revenue') {
    const { jobs } = loadJobs();
    json(res, calcRevenue(jobs));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ProFix dashboard → http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
