const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Create transporter
const createTransporter = () => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || pass === 'your-app-password-here') {
    console.log('⚠️ SMTP credentials not configured in .env file. Emails will be logged locally.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000
  });
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const calculateTotals = (billData) => {
  const items = Array.isArray(billData.items) ? billData.items : [];
  const totalQuantity = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totalItems = items.length;
  const totalSets = items.reduce((sum, item) => {
    let setsVal = item.sets || 0;
    if (typeof setsVal === 'string' && setsVal.includes('+')) {
      setsVal = setsVal.split('+').reduce((a, b) => a + (parseInt(b) || 0), 0);
    } else if (typeof setsVal === 'string') {
      setsVal = parseInt(setsVal, 10) || 0;
    }
    return sum + setsVal;
  }, 0);
  return { totalQuantity, totalItems, totalSets };
};

const buildPartyBillHTML = (billData) => {
  const docNum = billData.packingNumber || billData.billNumber || 'N/A';
  const { totalQuantity, totalItems, totalSets } = calculateTotals(billData);
  const currentDate = new Date().toLocaleString();

  let itemsRows = '';
  if (billData.items && billData.items.length > 0) {
    billData.items.forEach((item, idx) => {
      itemsRows += `
        <tr>
          <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${idx + 1}</td>
          <td style="border: 1px solid #ccc; padding: 6px;">${esc(item.lotNumber || '-')}</td>
          <td style="border: 1px solid #ccc; padding: 6px;">${esc(item.brand || '-')}</td>
          <td style="border: 1px solid #ccc; padding: 6px;">${esc(item.description || item.itemName)}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${esc(item.partNo || '-')}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${item.sets || 0}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${item.setsPerPcs || 0}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${item.rate || '-'}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align: center;"><strong>${item.quantity || 0}</strong></td>
        </tr>`;
    });
  }

  return `
    <div style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 900px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1e3a8a; color: white; padding: 20px;">
        <h2 style="margin: 0; font-size: 22px;">New Packing List: ${esc(docNum)}</h2>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">MH Dispatch System</p>
      </div>

      <div style="padding: 20px;">
        <h3 style="color: #1e3a8a; margin-top: 0;">Dispatch Details:</h3>
        <ul style="list-style-type: none; padding-left: 0; line-height: 1.8;">
          <li><strong>Party Name:</strong> ${esc(billData.partyName || 'N/A')}</li>
          <li><strong>Date:</strong> ${esc(billData.billDate || currentDate)}</li>
          <li><strong>Prepared By:</strong> ${esc(billData.preparedBy || 'System')} (${esc(billData.preparedByRole || 'Staff')})</li>
          ${billData.orderReference ? `<li><strong>Order Reference:</strong> ${esc(billData.orderReference)}</li>` : ''}
        </ul>

        <h3 style="color: #1e3a8a;">Items Summary:</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="border: 1px solid #ccc; padding: 6px;">#</th>
              <th style="border: 1px solid #ccc; padding: 6px; text-align: left;">Lot No</th>
              <th style="border: 1px solid #ccc; padding: 6px; text-align: left;">Brand</th>
              <th style="border: 1px solid #ccc; padding: 6px; text-align: left;">Description</th>
              <th style="border: 1px solid #ccc; padding: 6px;">Part No</th>
              <th style="border: 1px solid #ccc; padding: 6px;">Sets</th>
              <th style="border: 1px solid #ccc; padding: 6px;">Pcs/Set</th>
              <th style="border: 1px solid #ccc; padding: 6px;">Rate</th>
              <th style="border: 1px solid #ccc; padding: 6px;">Total Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div style="padding: 12px; background-color: #f0f9ff; border-radius: 6px; margin-top: 15px;">
          <strong>Total Items:</strong> ${totalItems} &nbsp;|&nbsp;
          <strong>Total Sets:</strong> ${totalSets} &nbsp;|&nbsp;
          <strong>Total Quantity:</strong> ${totalQuantity} Pcs
        </div>

        ${billData.notes ? `
          <div style="margin-top: 15px; padding: 10px; background-color: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
            <strong>Notes:</strong><br>${esc(billData.notes)}
          </div>
        ` : ''}

        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #64748b; text-align: center;">Generated automatically by MH Dispatch System on ${currentDate}</p>
      </div>
    </div>
  `;
};

const sendPartyBillEmailWithPDF = async (billData, pdfBuffer = null) => {
  const docNum = billData.packingNumber || billData.billNumber || 'N/A';
  const recipients = (process.env.PARTYBILL_EMAIL_TO || 'paras.goyal.it@gmail.com').split(',').map(s => s.trim()).filter(Boolean);

  const subject = `[Packing List] — ${docNum} — ${billData.partyName || 'N/A'}`;
  const htmlBody = buildPartyBillHTML(billData);

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `Packing_List_${docNum}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.log(`[EMAIL LOGGED] Subject: "${subject}" to [${recipients.join(', ')}]`);
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'MH Dispatch System'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}>`,
      to: recipients.join(', '),
      cc: process.env.PARTYBILL_EMAIL_CC || undefined,
      subject,
      html: htmlBody,
      attachments
    });
    console.log('✅ PartyBill email sent:', info.messageId);
    return true;
  } catch (err) {
    console.error('❌ Error sending PartyBill email:', err);
    return false;
  }
};

const sendGatepassEmailWithPDF = async (payload) => {
  const gatepassNumber = payload.gatepassNumber;
  const gatepassData = payload.gatepassData || {};
  const pdfBase64 = payload.pdfBase64;
  const pdfFileName = payload.pdfFileName || `Gatepass_${gatepassNumber}.pdf`;

  const recipients = (process.env.GATEPASS_EMAIL_TO || 'paras.goyal.it@gmail.com').split(',').map(s => s.trim()).filter(Boolean);
  const subject = `[Gatepass] ${gatepassNumber} - ${(gatepassData.selectedBills || []).length} Bills`;

  const attachments = [];
  if (pdfBase64) {
    attachments.push({
      filename: pdfFileName,
      content: Buffer.from(pdfBase64, 'base64'),
      contentType: 'application/pdf'
    });
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.log(`[GATEPASS EMAIL LOGGED] Subject: "${subject}" to [${recipients.join(', ')}]`);
    return { success: true, message: 'Gatepass email logged locally' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'MH Dispatch System'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}>`,
      to: recipients.join(', '),
      cc: process.env.GATEPASS_EMAIL_CC || undefined,
      subject,
      html: `<div style="font-family: Arial, sans-serif;"><h2>Gatepass Issued: ${esc(gatepassNumber)}</h2><p>Please find attached gatepass details PDF.</p></div>`,
      attachments
    });
    console.log('✅ Gatepass email sent:', info.messageId);
    return { success: true, message: 'Gatepass email sent', messageId: info.messageId };
  } catch (err) {
    console.error('❌ Error sending Gatepass email:', err);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendPartyBillEmailWithPDF,
  sendGatepassEmailWithPDF
};
