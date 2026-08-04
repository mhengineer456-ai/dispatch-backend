# MH Dispatch & Store Management Backend Service

A high-performance Node.js / Express backend service for managing bills, draft packing lists, gatepass updates, PDF generation, and automated email notifications.

## Features
- 🚀 **Full Compatibility:** Direct drop-in replacement for Google Apps Script webhooks (`/exec` and `/api/post`).
- 💾 **Local Data Storage:** Fast local JSON database (`/data/bills.json`, `/data/drafts.json`, `/data/gatepasses.json`).
- 📄 **PDF Generation:** Automated Packing List PDF creation.
- 📧 **Automated Email Notifications:** Nodemailer transport for sending Packing List PDFs and Gatepass PDFs.
- 🔍 **REST APIs:** Full endpoints for querying bills, drafts, gatepass logs, and dispatch summaries.

---

## Quick Start Guide

### 1. Install Dependencies
Navigate to the backend directory and install required npm packages:
```bash
cd backend
npm install
```

### 2. Configure Email Settings (Optional)
Edit the `.env` file to set your SMTP credentials (or Gmail App Password):
```env
PORT=5000
PARTYBILL_EMAIL_TO=paras.goyal.it@gmail.com
GATEPASS_EMAIL_TO=paras.goyal.it@gmail.com

# SMTP Settings (For sending real emails via Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=paras.goyal.it@gmail.com
SMTP_PASS=your-app-password
```

### 3. Run the Backend Server
```bash
npm start
```
The server will start on `http://localhost:5000`.

---

## API Endpoints

- `POST /exec` or `POST /api/post` — Receives Packing Lists, Drafts, Gatepass Updates & Emails.
- `GET /api/bills` — Get saved bills with optional date range filters.
- `GET /api/drafts` — Get active drafts.
- `GET /api/gatepasses` — Get gatepass records.
- `GET /api/dispatches/summary` — Dispatch analytics summary.
- `GET /api/health` — Health check endpoint.
