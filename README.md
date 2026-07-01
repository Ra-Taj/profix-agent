# ProFix Home Services — Job Manager

A CLI tool and live web dashboard for managing home service jobs. All data is saved to `jobs.json` and persists between sessions.

**Requirements:** Node.js (no external packages needed)

---

## Dashboard

Start the web server, then open your browser:

```
node agent.js
```

Open **http://localhost:3000** to see:
- Revenue summary cards (Collected / Outstanding / Pipeline / Total)
- Full job table with color-coded status badges
- Filter by status
- Auto-refreshes every 30 seconds

Use `Ctrl+C` to stop the server.

---

## Commands

### `add` — Create a new job

```
node profix.js add
```

Prompts you for:
- Client name
- Address
- Job type (e.g. "Roof repair", "HVAC tune-up")
- Scheduled date (`YYYY-MM-DD`)
- Notes (optional)
- One or more bid/estimate line items (description + amount each — leave the description blank to stop adding items)

Price is the sum of the line items. Each job is assigned a random 8-character hex ID.

---

### `list [status]` — View jobs

```
node profix.js list
node profix.js list estimate
node profix.js list scheduled
node profix.js list completed
node profix.js list paid
```

Without a status filter, shows every job. With a filter, shows only jobs at that status.

---

### `update <id>` — Advance job status

```
node profix.js update a1b2c3d4
```

Moves the job to the next stage in the workflow:

```
estimate → scheduled → completed → paid
```

Run this command once each time the job advances. Cannot go backwards.

---

### `invoice <id>` — Print invoice

```
node profix.js invoice a1b2c3d4
```

Prints a formatted plain-text invoice to the terminal. Pipe to a file to save it:

```
node profix.js invoice a1b2c3d4 > invoice-a1b2c3d4.txt
```

---

### `revenue` — Show revenue summary

```
node profix.js revenue
```

Displays three buckets:

| Bucket | Included statuses |
|---|---|
| Collected (paid) | `paid` |
| Outstanding | `completed` |
| Pipeline | `estimate`, `scheduled` |

Also shows a total across all buckets.

---

### `delete <id>` — Remove a job

```
node profix.js delete a1b2c3d4
```

Permanently removes the job from `jobs.json`. This cannot be undone.

---

## Status flow

```
estimate → scheduled → completed → paid
```

Use `node profix.js update <id>` to advance one step at a time.

---

## Data storage

All jobs are stored in `jobs.json` in this directory. Both `profix.js` (CLI) and `agent.js` (dashboard server) read and write the same file, so they stay in sync automatically. Back it up if needed — there is no cloud sync or database.

## Files

| File | Purpose |
|---|---|
| `profix.js` | CLI — add, list, update, invoice, revenue, delete |
| `agent.js` | HTTP server for the live dashboard (port 3000) |
| `dashboard.html` | Web dashboard served by `agent.js` |
| `jobs.json` | Data store — all jobs live here |
