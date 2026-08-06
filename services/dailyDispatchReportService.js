const cron = require('node-cron');
const nodemailer = require('nodemailer');
const fetch = globalThis.fetch || require('node-fetch');
const db = require('../db');
const googleSheetsDirectService = require('./googleSheetsDirectService');
const pdfService = require('./pdfService');
require('dotenv').config({ override: true });

const RECIPIENTS = process.env.PARTYBILL_EMAIL_TO
  ? process.env.PARTYBILL_EMAIL_TO.split(',').map(e => e.trim())
  : ["mhdispatch26@gmail.com"];

const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "MH Dispatch System";
const APPS_SCRIPT_URL = process.env.BILL_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwSOsKfAlKYq-wYGFa4KWnGwryK1T0ViJYigil8pCbZz_xkK3gv0tqtCgB-k54rRVfa/exec";

// Create Nodemailer Transporter
const createTransporter = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || "mhdispatch26@gmail.com";
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!pass || pass === 'your-app-password-here') {
    return null;
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  if (host.includes('gmail')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }

  return nodemailer.createTransport({
    host: host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  });
};

// Generate Royal Navy & White Theme HTML Email for DAILY Dispatches (100% Mobile Safe 5-Column Table)
// Columns: # | Bill No | Date | Party Name | Total Pcs
const generateDailyDispatchEmailHTML = (dateStr, todayBills) => {
  const dateObj = new Date(dateStr);
  const formattedDate = dateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).toUpperCase();

  const totalDispatches = todayBills.length;
  const uniqueParties = new Set(todayBills.map(b => b.partyName || b.party)).size;
  
  let totalQty = 0;

  todayBills.forEach(bill => {
    const items = Array.isArray(bill.items) ? bill.items : [];
    if (items.length > 0) {
      items.forEach(item => {
        totalQty += (Number(item.quantity) || 0);
      });
    } else {
      totalQty += (Number(bill.totalQuantity) || 0);
    }
  });

  const tableRowsHTML = todayBills.map((bill, index) => {
    const items = Array.isArray(bill.items) ? bill.items : [];
    const billQty = items.length > 0 
      ? items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
      : (Number(bill.totalQuantity) || 0);

    const bDate = bill.billDate || (bill.createdDate ? bill.createdDate.split('T')[0] : dateStr);
    const bDateFmt = new Date(bDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();

    return `
      <tr style="background-color: ${index % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}; font-size: 12px; color: #0F172A;">
        <td style="padding: 10px 6px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; text-align: center; vertical-align: middle;">${index + 1}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; font-weight: 700; color: #1E3A8A; word-break: break-word; vertical-align: middle;">${bill.packingNumber || bill.billNumber}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; vertical-align: middle; color: #475569; white-space: nowrap;">${bDateFmt}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; font-weight: 600; color: #0F172A; word-break: break-word; vertical-align: middle;">${bill.partyName || bill.party || 'N/A'}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 800; color: #1E3A8A; vertical-align: middle; white-space: nowrap;">${billQty} Pcs</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Royal Navy Daily Dispatch Register</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
      <div style="max-width: 620px; width: 100%; margin: 15px auto; background: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 25px rgba(15,23,42,0.1); border: 1px solid #CBD5E1;">
        
        <div style="background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%); padding: 22px 20px; color: #FFFFFF; border-bottom: 4px solid #2563EB;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #93C5FD; text-transform: uppercase;">
                  ROYAL EXECUTIVE REGISTER
                </div>
                <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px; margin-top: 3px; color: #FFFFFF; text-transform: uppercase;">
                  MH DISPATCH & STORE MANAGEMENT
                </div>
              </td>
              <td style="text-align: right; vertical-align: top;">
                <div style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); padding: 5px 10px; display: inline-block; border-radius: 4px; font-weight: 700; font-size: 11px; color: #FFFFFF;">
                  📅 ${formattedDate}
                </div>
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #F8FAFC; padding: 10px 20px; border-bottom: 1px solid #E2E8F0; font-size: 11px; font-weight: 600; color: #475569;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td><b>Statement:</b> Daily Dispatch Register</td>
              <td style="text-align: right; color: #059669;"><b>Status:</b> Official / Final</td>
            </tr>
          </table>
        </div>

        <div style="padding: 16px 20px; background: #FFFFFF;">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden;">
            <tr style="background: #1E3A8A; color: #FFFFFF; font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
              <td style="padding: 8px; border-right: 1px solid #3B82F6; text-align: center; width: 33%;">Total Bills</td>
              <td style="padding: 8px; border-right: 1px solid #3B82F6; text-align: center; width: 33%;">Parties Served</td>
              <td style="padding: 8px; text-align: center; width: 34%;">Total Quantity</td>
            </tr>
            <tr style="font-size: 15px; font-weight: 800; color: #0F172A; background: #EFF6FF;">
              <td style="padding: 10px; border-right: 1px solid #DBEAFE; text-align: center; color: #1E3A8A;">${totalDispatches} Nos</td>
              <td style="padding: 10px; border-right: 1px solid #DBEAFE; text-align: center; color: #1E3A8A;">${uniqueParties} Parties</td>
              <td style="padding: 10px; text-align: center; color: #2563EB;">${totalQty} Pcs</td>
            </tr>
          </table>
        </div>

        <div style="padding: 0 20px 20px 20px;">
          <div style="font-size: 12px; font-weight: 800; color: #1E3A8A; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
            📋 Daily Dispatch Register Details (${totalDispatches} Bills)
          </div>

          ${totalDispatches === 0 ? `
            <div style="padding: 30px; text-align: center; background: #F8FAFC; border: 1px dashed #CBD5E1; color: #64748B; font-weight: 600; border-radius: 6px;">
              No dispatch bills recorded on ${formattedDate}.
            </div>
          ` : `
            <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #CBD5E1; font-size: 11px; table-layout: fixed; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr style="background-color: #1E3A8A; color: #FFFFFF; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <th style="padding: 8px 4px; text-align: center; border-right: 1px solid #3B82F6;" width="8%">#</th>
                  <th style="padding: 8px 6px; text-align: left; border-right: 1px solid #3B82F6;" width="22%">Bill No</th>
                  <th style="padding: 8px 6px; text-align: left; border-right: 1px solid #3B82F6;" width="18%">Date</th>
                  <th style="padding: 8px 6px; text-align: left; border-right: 1px solid #3B82F6;" width="37%">Party Name</th>
                  <th style="padding: 8px 6px; text-align: right;" width="15%">Total Pcs</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHTML}
              </tbody>
              <tfoot>
                <tr style="background-color: #EFF6FF; color: #1E3A8A; font-size: 12px; font-weight: 900; border-top: 2px solid #1E3A8A; border-bottom: 3px double #1E3A8A;">
                  <td style="padding: 10px 6px; text-align: right;" colspan="4">GRAND TOTAL REGISTER:</td>
                  <td style="padding: 10px 6px; text-align: right; color: #1E3A8A;">${totalQty} Pcs</td>
                </tr>
              </tfoot>
            </table>
          `}
        </div>

        <div style="background-color: #0F172A; padding: 14px 20px; text-align: center; color: #94A3B8; font-size: 11px; border-top: 1px solid #1E293B;">
          <div style="color: #FFFFFF; font-weight: 700; margin-bottom: 2px;">MH DISPATCH & STORE MANAGEMENT SYSTEM</div>
          <div style="font-size: 10px; color: #64748B;">Automated Royal Executive Daily Statement • Delivered to ${RECIPIENTS.join(', ')}</div>
        </div>

      </div>
    </body>
    </html>
  `;
};

// Generate Royal Navy & White Theme HTML Email for WEEKLY Dispatches
// Table Headers: # | Party Account Name | Date | Total pcs (Separate row per bill, sorted Date-wise)
const generateWeeklyDispatchEmailHTML = (startDateStr, endDateStr, weeklyBills) => {
  const startFmt = new Date(startDateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
  const endFmt = new Date(endDateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  const totalDispatches = weeklyBills.length;
  const uniqueParties = new Set(weeklyBills.map(b => (b.partyName || b.party || '').trim())).size;
  
  let totalQty = 0;

  const processedBills = weeklyBills.map(bill => {
    const items = Array.isArray(bill.items) ? bill.items : [];
    let bQty = 0;
    if (items.length > 0) {
      items.forEach(item => { bQty += (Number(item.quantity) || 0); });
    } else {
      bQty = Number(bill.totalQuantity) || 0;
    }
    totalQty += bQty;
    return { ...bill, calculatedQty: bQty };
  });

  processedBills.sort((a, b) => {
    const dA = a.billDate || (a.createdDate ? a.createdDate.split('T')[0] : '');
    const dB = b.billDate || (b.createdDate ? b.createdDate.split('T')[0] : '');
    if (dA < dB) return -1;
    if (dA > dB) return 1;
    
    const pA = (a.partyName || a.party || '').toLowerCase();
    const pB = (b.partyName || b.party || '').toLowerCase();
    if (pA < pB) return -1;
    if (pA > pB) return 1;

    const bA = (a.packingNumber || a.billNumber || '').toLowerCase();
    const bB = (b.packingNumber || b.billNumber || '').toLowerCase();
    return bA.localeCompare(bB);
  });

  const tableRowsHTML = processedBills.map((bill, index) => {
    const bDate = bill.billDate || (bill.createdDate ? bill.createdDate.split('T')[0] : startDateStr);
    const bDateFmt = new Date(bDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
    const bNo = bill.packingNumber || bill.billNumber || '';

    const partyDisplay = bNo 
      ? `<b>${bill.partyName || bill.party || 'N/A'}</b> <span style="color: #64748B; font-size: 11px;">(${bNo})</span>`
      : `<b>${bill.partyName || bill.party || 'N/A'}</b>`;

    return `
      <tr style="background-color: ${index % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}; font-size: 12px; color: #0F172A;">
        <td style="padding: 10px 6px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; text-align: center; vertical-align: middle;">${index + 1}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; color: #1E3A8A; word-break: break-word; vertical-align: middle;">${partyDisplay}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; text-align: center; font-weight: 600; color: #475569; vertical-align: middle; white-space: nowrap;">${bDateFmt}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 800; color: #1E3A8A; vertical-align: middle; white-space: nowrap;">${bill.calculatedQty} Pcs</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Royal Navy Weekly Dispatch Register</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
      <div style="max-width: 620px; width: 100%; margin: 15px auto; background: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 25px rgba(15,23,42,0.1); border: 1px solid #CBD5E1;">
        
        <div style="background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%); padding: 22px 20px; color: #FFFFFF; border-bottom: 4px solid #2563EB;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #93C5FD; text-transform: uppercase;">
                  ROYAL EXECUTIVE REGISTER
                </div>
                <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px; margin-top: 3px; color: #FFFFFF; text-transform: uppercase;">
                  MH DISPATCH & STORE MANAGEMENT
                </div>
              </td>
              <td style="text-align: right; vertical-align: top;">
                <div style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); padding: 5px 10px; display: inline-block; border-radius: 4px; font-weight: 700; font-size: 11px; color: #FFFFFF;">
                  📊 WEEKLY REPORT
                </div>
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #F8FAFC; padding: 10px 20px; border-bottom: 1px solid #E2E8F0; font-size: 11px; font-weight: 600; color: #475569;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td><b>Period:</b> ${startFmt} TO ${endFmt}</td>
              <td style="text-align: right; color: #059669;"><b>Status:</b> Official / Audited</td>
            </tr>
          </table>
        </div>

        <div style="padding: 16px 20px; background: #FFFFFF;">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden;">
            <tr style="background: #1E3A8A; color: #FFFFFF; font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
              <td style="padding: 8px; border-right: 1px solid #3B82F6; text-align: center; width: 33%;">Parties Served</td>
              <td style="padding: 8px; border-right: 1px solid #3B82F6; text-align: center; width: 33%;">Total Bills</td>
              <td style="padding: 8px; text-align: center; width: 34%;">Weekly Quantity</td>
            </tr>
            <tr style="font-size: 15px; font-weight: 800; color: #0F172A; background: #EFF6FF;">
              <td style="padding: 10px; border-right: 1px solid #DBEAFE; text-align: center; color: #1E3A8A;">${uniqueParties} Parties</td>
              <td style="padding: 10px; border-right: 1px solid #DBEAFE; text-align: center; color: #1E3A8A;">${totalDispatches} Bills</td>
              <td style="padding: 10px; text-align: center; color: #2563EB;">${totalQty} Pcs</td>
            </tr>
          </table>
        </div>

        <div style="padding: 0 20px 20px 20px;">
          <div style="font-size: 12px; font-weight: 800; color: #1E3A8A; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
            🏢 Weekly Dispatch Register (${totalDispatches} Separate Bills)
          </div>

          ${totalDispatches === 0 ? `
            <div style="padding: 30px; text-align: center; background: #F8FAFC; border: 1px dashed #CBD5E1; color: #64748B; font-weight: 600; border-radius: 6px;">
              No dispatch bills recorded for period (${startFmt} - ${endFmt}).
            </div>
          ` : `
            <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #CBD5E1; font-size: 11px; table-layout: fixed; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr style="background-color: #1E3A8A; color: #FFFFFF; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <th style="padding: 8px 4px; text-align: center; border-right: 1px solid #3B82F6;" width="8%">#</th>
                  <th style="padding: 8px 8px; text-align: left; border-right: 1px solid #3B82F6;" width="52%">Party Account Name</th>
                  <th style="padding: 8px 6px; text-align: center; border-right: 1px solid #3B82F6;" width="20%">Date</th>
                  <th style="padding: 8px 8px; text-align: right;" width="20%">Total pcs</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHTML}
              </tbody>
              <tfoot>
                <tr style="background-color: #EFF6FF; color: #1E3A8A; font-size: 12px; font-weight: 900; border-top: 2px solid #1E3A8A; border-bottom: 3px double #1E3A8A;">
                  <td style="padding: 10px 8px; text-align: right;" colspan="3">WEEKLY GRAND TOTAL:</td>
                  <td style="padding: 10px 8px; text-align: right; color: #1E3A8A;">${totalQty} Pcs</td>
                </tr>
              </tfoot>
            </table>
          `}
        </div>

        <div style="background-color: #0F172A; padding: 14px 20px; text-align: center; color: #94A3B8; font-size: 11px; border-top: 1px solid #1E293B;">
          <div style="color: #FFFFFF; font-weight: 700; margin-bottom: 2px;">MH DISPATCH & STORE MANAGEMENT SYSTEM</div>
          <div style="font-size: 10px; color: #64748B;">Automated Royal Executive Weekly Statement • Delivered to ${RECIPIENTS.join(', ')}</div>
        </div>

      </div>
    </body>
    </html>
  `;
};

// Generate Royal Navy & White Theme HTML Email for MONTHLY Dispatches
// Columns: # | Party Account Name | Date | Total pcs
const generateMonthlyDispatchEmailHTML = (year, monthIndex, monthlyBills) => {
  const monthDate = new Date(year, monthIndex, 1);
  const monthName = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase();

  const totalDispatches = monthlyBills.length;
  const uniqueParties = new Set(monthlyBills.map(b => (b.partyName || b.party || '').trim())).size;
  
  let totalQty = 0;

  const processedBills = monthlyBills.map(bill => {
    const items = Array.isArray(bill.items) ? bill.items : [];
    let bQty = 0;
    if (items.length > 0) {
      items.forEach(item => { bQty += (Number(item.quantity) || 0); });
    } else {
      bQty = Number(bill.totalQuantity) || 0;
    }
    totalQty += bQty;
    return { ...bill, calculatedQty: bQty };
  });

  processedBills.sort((a, b) => {
    const dA = a.billDate || (a.createdDate ? a.createdDate.split('T')[0] : '');
    const dB = b.billDate || (b.createdDate ? b.createdDate.split('T')[0] : '');
    if (dA < dB) return -1;
    if (dA > dB) return 1;
    
    const pA = (a.partyName || a.party || '').toLowerCase();
    const pB = (b.partyName || b.party || '').toLowerCase();
    if (pA < pB) return -1;
    if (pA > pB) return 1;

    const bA = (a.packingNumber || a.billNumber || '').toLowerCase();
    const bB = (b.packingNumber || b.billNumber || '').toLowerCase();
    return bA.localeCompare(bB);
  });

  const tableRowsHTML = processedBills.map((bill, index) => {
    const bDate = bill.billDate || (bill.createdDate ? bill.createdDate.split('T')[0] : '');
    const bDateFmt = bDate ? new Date(bDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase() : 'N/A';
    const bNo = bill.packingNumber || bill.billNumber || '';

    const partyDisplay = bNo 
      ? `<b>${bill.partyName || bill.party || 'N/A'}</b> <span style="color: #64748B; font-size: 11px;">(${bNo})</span>`
      : `<b>${bill.partyName || bill.party || 'N/A'}</b>`;

    return `
      <tr style="background-color: ${index % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}; font-size: 12px; color: #0F172A;">
        <td style="padding: 10px 6px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; text-align: center; vertical-align: middle;">${index + 1}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; color: #1E3A8A; word-break: break-word; vertical-align: middle;">${partyDisplay}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; text-align: center; font-weight: 600; color: #475569; vertical-align: middle; white-space: nowrap;">${bDateFmt}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 800; color: #1E3A8A; vertical-align: middle; white-space: nowrap;">${bill.calculatedQty} Pcs</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Royal Navy Monthly Dispatch Register</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
      <div style="max-width: 620px; width: 100%; margin: 15px auto; background: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 25px rgba(15,23,42,0.1); border: 1px solid #CBD5E1;">
        
        <div style="background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%); padding: 22px 20px; color: #FFFFFF; border-bottom: 4px solid #2563EB;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #93C5FD; text-transform: uppercase;">
                  ROYAL EXECUTIVE REGISTER
                </div>
                <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px; margin-top: 3px; color: #FFFFFF; text-transform: uppercase;">
                  MH DISPATCH & STORE MANAGEMENT
                </div>
              </td>
              <td style="text-align: right; vertical-align: top;">
                <div style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); padding: 5px 10px; display: inline-block; border-radius: 4px; font-weight: 700; font-size: 11px; color: #FFFFFF;">
                  📆 MONTHLY REPORT
                </div>
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #F8FAFC; padding: 10px 20px; border-bottom: 1px solid #E2E8F0; font-size: 11px; font-weight: 600; color: #475569;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td><b>Month:</b> ${monthName}</td>
              <td style="text-align: right; color: #059669;"><b>Status:</b> Official / Audited</td>
            </tr>
          </table>
        </div>

        <div style="padding: 16px 20px; background: #FFFFFF;">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden;">
            <tr style="background: #1E3A8A; color: #FFFFFF; font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
              <td style="padding: 8px; border-right: 1px solid #3B82F6; text-align: center; width: 33%;">Monthly Bills</td>
              <td style="padding: 8px; border-right: 1px solid #3B82F6; text-align: center; width: 33%;">Parties Served</td>
              <td style="padding: 8px; text-align: center; width: 34%;">Monthly Quantity</td>
            </tr>
            <tr style="font-size: 15px; font-weight: 800; color: #0F172A; background: #EFF6FF;">
              <td style="padding: 10px; border-right: 1px solid #DBEAFE; text-align: center; color: #1E3A8A;">${totalDispatches} Nos</td>
              <td style="padding: 10px; border-right: 1px solid #DBEAFE; text-align: center; color: #1E3A8A;">${uniqueParties} Parties</td>
              <td style="padding: 10px; text-align: center; color: #2563EB;">${totalQty} Pcs</td>
            </tr>
          </table>
        </div>

        <div style="padding: 0 20px 20px 20px;">
          <div style="font-size: 12px; font-weight: 800; color: #1E3A8A; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
            🏢 Monthly Dispatch Register (${monthName} — ${totalDispatches} Bills)
          </div>

          ${totalDispatches === 0 ? `
            <div style="padding: 30px; text-align: center; background: #F8FAFC; border: 1px dashed #CBD5E1; color: #64748B; font-weight: 600; border-radius: 6px;">
              No dispatch bills recorded for month of ${monthName}.
            </div>
          ` : `
            <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #CBD5E1; font-size: 11px; table-layout: fixed; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr style="background-color: #1E3A8A; color: #FFFFFF; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <th style="padding: 8px 4px; text-align: center; border-right: 1px solid #3B82F6;" width="8%">#</th>
                  <th style="padding: 8px 8px; text-align: left; border-right: 1px solid #3B82F6;" width="52%">Party Account Name</th>
                  <th style="padding: 8px 6px; text-align: center; border-right: 1px solid #3B82F6;" width="20%">Date</th>
                  <th style="padding: 8px 8px; text-align: right;" width="20%">Total pcs</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHTML}
              </tbody>
              <tfoot>
                <tr style="background-color: #EFF6FF; color: #1E3A8A; font-size: 12px; font-weight: 900; border-top: 2px solid #1E3A8A; border-bottom: 3px double #1E3A8A;">
                  <td style="padding: 10px 8px; text-align: right;" colspan="3">MONTHLY GRAND TOTAL:</td>
                  <td style="padding: 10px 8px; text-align: right; color: #1E3A8A;">${totalQty} Pcs</td>
                </tr>
              </tfoot>
            </table>
          `}
        </div>

        <div style="background-color: #0F172A; padding: 14px 20px; text-align: center; color: #94A3B8; font-size: 11px; border-top: 1px solid #1E293B;">
          <div style="color: #FFFFFF; font-weight: 700; margin-bottom: 2px;">MH DISPATCH & STORE MANAGEMENT SYSTEM</div>
          <div style="font-size: 10px; color: #64748B;">Automated Royal Executive Monthly Statement • Delivered to ${RECIPIENTS.join(', ')}</div>
        </div>

      </div>
    </body>
    </html>
  `;
};

// Send Daily Dispatch Summary
const sendDailyDispatchReport = async (customDateStr = null) => {
  const targetDateStr = customDateStr || new Date().toISOString().split('T')[0];
  console.log(`\n📧 [NIGHTLY DISPATCH REPORT] Preparing daily summary for date: ${targetDateStr}...`);

  const localBills = db.getBills();
  let sheetBills = [];
  try {
    sheetBills = await googleSheetsDirectService.fetchBillsFromSheet();
  } catch (sheetErr) {
    console.warn(`⚠️ Could not fetch bills from Google Sheet: ${sheetErr.message}`);
  }

  const billMap = new Map();
  [...localBills, ...sheetBills].forEach(b => {
    const key = b.packingNumber || b.billNumber;
    if (key) billMap.set(key, b);
  });
  const allBills = Array.from(billMap.values());

  const todayBills = allBills.filter(bill => {
    const bDate = bill.billDate || (bill.createdDate ? bill.createdDate.split('T')[0] : '');
    const cDate = bill.createdDate ? bill.createdDate.split('T')[0] : '';
    return bDate === targetDateStr || cDate === targetDateStr || String(bDate).startsWith(targetDateStr);
  });

  console.log(`📦 Found ${todayBills.length} dispatches (from Local DB + Google Sheets) for date ${targetDateStr}`);

  const formattedDate = new Date(targetDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const html = generateDailyDispatchEmailHTML(targetDateStr, todayBills);

  // Generate Tally Register PDF Buffer
  const pdfBuffer = pdfService.generateTallyRegisterPDF('Daily Dispatch Register Summary', formattedDate, todayBills);
  const pdfFilename = `Daily_Dispatch_Register_${targetDateStr}.pdf`;

  const transporter = createTransporter();
  if (transporter) {
    try {
      const userEmail = process.env.SMTP_USER || process.env.GMAIL_USER || "paras.goyal.it@gmail.com";
      const mailOptions = {
        from: `"${EMAIL_FROM_NAME}" <${userEmail}>`,
        to: RECIPIENTS,
        subject: `[Daily Dispatch Summary] ${formattedDate} - ${todayBills.length} Dispatches Completed`,
        html: html,
        attachments: pdfBuffer ? [
          {
            filename: pdfFilename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ] : []
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ [NIGHTLY DISPATCH REPORT] Sent via Node.js SMTP with Tally PDF Attachment! MessageID: ${info.messageId}`);
      return {
        success: true,
        method: 'NodeJS_SMTP',
        message: `Daily dispatch report sent via Node.js SMTP for ${targetDateStr}`,
        dispatchesCount: todayBills.length,
        recipients: RECIPIENTS,
        messageId: info.messageId,
        hasPdfAttachment: true
      };
    } catch (smtpErr) {
      console.warn(`⚠️ Node.js SMTP failed (${smtpErr.message}). Routing via Google Apps Script Web App engine...`);
    }
  }

  try {
    const formData = new URLSearchParams();
    const payloadObj = {
      action: 'sendDailyReport',
      sendEmail: true,
      recipients: RECIPIENTS,
      subject: `[Daily Dispatch Summary] ${formattedDate} - ${todayBills.length} Dispatches Completed`,
      html: html,
      billNumber: `DAILY-SUMMARY-${targetDateStr}`,
      partyName: 'Daily Summary Report'
    };

    formData.append('payload', JSON.stringify(payloadObj));
    formData.append('action', 'sendDailyReport');
    formData.append('recipients', JSON.stringify(RECIPIENTS));

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const text = await response.text();
    console.log(`✅ [NIGHTLY DISPATCH REPORT] Sent via Apps Script Web App Engine:`, text.substring(0, 100));

    return {
      success: true,
      method: 'AppsScriptEngine',
      message: `Daily dispatch report triggered via Apps Script Web App Mail Engine for ${targetDateStr}`,
      dispatchesCount: todayBills.length,
      recipients: RECIPIENTS
    };
  } catch (err) {
    console.error(`❌ [NIGHTLY DISPATCH REPORT] Failed to send report: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// Helper to get Monday-to-Sunday Calendar Week Bounds
const getCalendarWeekBounds = (refDateObj = new Date()) => {
  const d = new Date(refDateObj);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMon = (day === 0 ? 6 : day - 1);
  
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMon);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDateStr: monday.toISOString().split('T')[0],
    endDateStr: sunday.toISOString().split('T')[0],
    startDate: monday,
    endDate: sunday
  };
};

// Send Weekly Dispatch Summary (Current Calendar Week: Monday to Sunday)
const sendWeeklyDispatchReport = async (customRefDateStr = null) => {
  const refDate = customRefDateStr ? new Date(customRefDateStr) : new Date();
  const { startDateStr, endDateStr, startDate, endDate } = getCalendarWeekBounds(refDate);

  console.log(`\n📧 [WEEKLY DISPATCH REPORT] Preparing weekly summary for Calendar Week: ${startDateStr} (Mon) to ${endDateStr} (Sun)...`);

  const localBills = db.getBills();
  let sheetBills = [];
  try {
    sheetBills = await googleSheetsDirectService.fetchBillsFromSheet();
  } catch (sheetErr) {
    console.warn(`⚠️ Could not fetch bills from Google Sheet: ${sheetErr.message}`);
  }

  const billMap = new Map();
  [...localBills, ...sheetBills].forEach(b => {
    const key = b.packingNumber || b.billNumber;
    if (key) billMap.set(key, b);
  });
  const allBills = Array.from(billMap.values());

  const weeklyBills = allBills.filter(bill => {
    const bDate = bill.billDate || (bill.createdDate ? bill.createdDate.split('T')[0] : '');
    return bDate >= startDateStr && bDate <= endDateStr;
  });

  console.log(`📦 Found ${weeklyBills.length} weekly dispatches for period ${startDateStr} to ${endDateStr}`);

  const startFmt = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endFmt = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const html = generateWeeklyDispatchEmailHTML(startDateStr, endDateStr, weeklyBills);

  // Generate Tally Register PDF Buffer
  const pdfBuffer = pdfService.generateTallyRegisterPDF('Weekly Dispatch Register Statement', `${startFmt} - ${endFmt}`, weeklyBills);
  const pdfFilename = `Weekly_Dispatch_Register_${startDateStr}_to_${endDateStr}.pdf`;

  const transporter = createTransporter();
  if (transporter) {
    try {
      const userEmail = process.env.SMTP_USER || process.env.GMAIL_USER || "paras.goyal.it@gmail.com";
      const mailOptions = {
        from: `"${EMAIL_FROM_NAME}" <${userEmail}>`,
        to: RECIPIENTS,
        subject: `[Weekly Dispatch Register] ${startFmt} - ${endFmt} (${weeklyBills.length} Bills Total)`,
        html: html,
        attachments: pdfBuffer ? [
          {
            filename: pdfFilename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ] : []
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ [WEEKLY DISPATCH REPORT] Sent via Node.js SMTP with Tally PDF Attachment! MessageID: ${info.messageId}`);
      return {
        success: true,
        method: 'NodeJS_SMTP',
        message: `Weekly dispatch report sent via Node.js SMTP for ${startFmt} to ${endFmt}`,
        dispatchesCount: weeklyBills.length,
        recipients: RECIPIENTS,
        messageId: info.messageId,
        hasPdfAttachment: true
      };
    } catch (smtpErr) {
      console.warn(`⚠️ Node.js SMTP failed (${smtpErr.message}). Routing via Google Apps Script Web App engine...`);
    }
  }

  try {
    const formData = new URLSearchParams();
    const payloadObj = {
      action: 'sendWeeklyReport',
      sendEmail: true,
      recipients: RECIPIENTS,
      subject: `[Weekly Dispatch Register] ${startFmt} - ${endFmt} (${weeklyBills.length} Bills Total)`,
      html: html,
      billNumber: `WEEKLY-SUMMARY-${endDateStr}`,
      partyName: 'Weekly Summary Report'
    };

    formData.append('payload', JSON.stringify(payloadObj));
    formData.append('action', 'sendWeeklyReport');
    formData.append('recipients', JSON.stringify(RECIPIENTS));

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const text = await response.text();
    console.log(`✅ [WEEKLY DISPATCH REPORT] Sent via Apps Script Web App Engine:`, text.substring(0, 100));

    return {
      success: true,
      method: 'AppsScriptEngine',
      message: `Weekly dispatch report triggered via Apps Script Web App Mail Engine for ${startFmt} to ${endFmt}`,
      dispatchesCount: weeklyBills.length,
      recipients: RECIPIENTS
    };
  } catch (err) {
    console.error(`❌ [WEEKLY DISPATCH REPORT] Failed to send report: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// Send Monthly Dispatch Summary (For a given Month & Year)
const sendMonthlyDispatchReport = async (customYear = null, customMonthStr = null) => {
  const now = new Date();
  const year = customYear ? parseInt(customYear) : now.getFullYear();
  const monthIndex = customMonthStr !== null && customMonthStr !== undefined ? (parseInt(customMonthStr) - 1) : now.getMonth();

  const monthDate = new Date(year, monthIndex, 1);
  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  console.log(`\n📧 [MONTHLY DISPATCH REPORT] Preparing monthly summary for Month: ${monthName} (${monthPrefix})...`);

  const localBills = db.getBills();
  let sheetBills = [];
  try {
    sheetBills = await googleSheetsDirectService.fetchBillsFromSheet();
  } catch (sheetErr) {
    console.warn(`⚠️ Could not fetch bills from Google Sheet: ${sheetErr.message}`);
  }

  const billMap = new Map();
  [...localBills, ...sheetBills].forEach(b => {
    const key = b.packingNumber || b.billNumber;
    if (key) billMap.set(key, b);
  });
  const allBills = Array.from(billMap.values());

  const monthlyBills = allBills.filter(bill => {
    const bDate = bill.billDate || (bill.createdDate ? bill.createdDate.split('T')[0] : '');
    return bDate && bDate.startsWith(monthPrefix);
  });

  console.log(`📦 Found ${monthlyBills.length} monthly dispatches for period ${monthName}`);

  const html = generateMonthlyDispatchEmailHTML(year, monthIndex, monthlyBills);

  // Generate Tally Register PDF Buffer
  const pdfBuffer = pdfService.generateTallyRegisterPDF('Monthly Dispatch Register Statement', monthName, monthlyBills);
  const pdfFilename = `Monthly_Dispatch_Register_${monthPrefix}.pdf`;

  const transporter = createTransporter();
  if (transporter) {
    try {
      const userEmail = process.env.SMTP_USER || process.env.GMAIL_USER || "paras.goyal.it@gmail.com";
      const mailOptions = {
        from: `"${EMAIL_FROM_NAME}" <${userEmail}>`,
        to: RECIPIENTS,
        subject: `[Monthly Dispatch Statement] ${monthName} (${monthlyBills.length} Bills Total)`,
        html: html,
        attachments: pdfBuffer ? [
          {
            filename: pdfFilename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ] : []
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ [MONTHLY DISPATCH REPORT] Sent via Node.js SMTP with Tally PDF Attachment! MessageID: ${info.messageId}`);
      return {
        success: true,
        method: 'NodeJS_SMTP',
        message: `Monthly dispatch report sent via Node.js SMTP for ${monthName}`,
        dispatchesCount: monthlyBills.length,
        recipients: RECIPIENTS,
        messageId: info.messageId,
        hasPdfAttachment: true
      };
    } catch (smtpErr) {
      console.warn(`⚠️ Node.js SMTP failed (${smtpErr.message}). Routing via Google Apps Script Web App engine...`);
    }
  }

  try {
    const formData = new URLSearchParams();
    const payloadObj = {
      action: 'sendMonthlyReport',
      sendEmail: true,
      recipients: RECIPIENTS,
      subject: `[Monthly Dispatch Statement] ${monthName} (${monthlyBills.length} Bills Total)`,
      html: html,
      billNumber: `MONTHLY-SUMMARY-${monthPrefix}`,
      partyName: 'Monthly Summary Report'
    };

    formData.append('payload', JSON.stringify(payloadObj));
    formData.append('action', 'sendMonthlyReport');
    formData.append('recipients', JSON.stringify(RECIPIENTS));

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const text = await response.text();
    console.log(`✅ [MONTHLY DISPATCH REPORT] Sent via Apps Script Web App Engine:`, text.substring(0, 100));

    return {
      success: true,
      method: 'AppsScriptEngine',
      message: `Monthly dispatch report triggered via Apps Script Web App Mail Engine for ${monthName}`,
      dispatchesCount: monthlyBills.length,
      recipients: RECIPIENTS
    };
  } catch (err) {
    console.error(`❌ [MONTHLY DISPATCH REPORT] Failed to send report: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// Schedule Cron Jobs:
// 1. Daily Nightly Dispatch Summary: Every night at 10:00 PM (0 22 * * *)
// 2. Weekly Dispatch Summary: Every Sunday night at 10:00 PM (0 22 * * 0)
// 3. Monthly Dispatch Summary: Last day of every month at 10:00 PM (0 22 28-31 * *)
const initDailyDispatchCron = () => {
  console.log('⏰ Scheduling Nightly Dispatch Summary Cron Job for 10:00 PM daily (0 22 * * *)...');
  cron.schedule('0 22 * * *', async () => {
    console.log('⏰ [CRON TRIGGER 10:00 PM] Running Nightly Dispatch Summary Report...');
    await sendDailyDispatchReport();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  console.log('⏰ Scheduling Weekly Dispatch Summary Cron Job for Sunday 10:00 PM (0 22 * * 0)...');
  cron.schedule('0 22 * * 0', async () => {
    console.log('⏰ [CRON TRIGGER SUNDAY 10:00 PM] Running Weekly Dispatch Summary Report...');
    await sendWeeklyDispatchReport();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  console.log('⏰ Scheduling Monthly Dispatch Summary Cron Job for Last Day of Month 10:00 PM (0 22 28-31 * *)...');
  cron.schedule('0 22 28-31 * *', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    // If tomorrow is day 1 of next month, today is the LAST day of the month!
    if (tomorrow.getDate() === 1) {
      console.log('⏰ [CRON TRIGGER MONTHLY 10:00 PM] Running Last Day of Month Summary Report...');
      await sendMonthlyDispatchReport();
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
};

module.exports = {
  sendDailyDispatchReport,
  sendWeeklyDispatchReport,
  sendMonthlyDispatchReport,
  initDailyDispatchCron
};
