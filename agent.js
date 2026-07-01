#!/usr/bin/env node

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT      = 3000;
const DATA_FILE = path.join(__dirname, 'jobs.json');
const DASHBOARD = path.join(__dirname, 'dashboard.html');

function loadJobs() {
  if (!fs.existsSync(DATA_FILE)) return { jobs: [] };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function calcRevenue(jobs) {
  const paid        = jobs.filter(j => j.status === 'paid');
  const outstanding = jobs.filter(j => ['invoiced', 'completed'].includes(j.status));
  const pipeline    = jobs.filter(j => ['scheduled', 'in-progress'].includes(j.status));
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

  if (pathname === '/api/jobs') {
    const { jobs } = loadJobs();
    json(res, jobs);
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
