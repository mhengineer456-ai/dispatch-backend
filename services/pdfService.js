const { jsPDF } = require('jspdf');

const generatePackingListPDF = (billData) => {
  try {
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    const docNum = billData.packingNumber || billData.billNumber || 'N/A';
    const partyName = billData.partyName || 'N/A';
    const billDate = billData.billDate || new Date().toISOString().split('T')[0];

    // Header
    doc.setFillColor(30, 58, 138); // Dark blue header
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('PACKING LIST', 105, 12, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`[Packing List] - ${docNum}`, 105, 18, { align: 'center' });

    // Details Block
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Document No: ${docNum}`, 14, 32);
    doc.text(`Date: ${billDate}`, 14, 38);
    doc.text(`Party Name: ${partyName}`, 140, 32);
    doc.text(`Prepared By: ${billData.preparedBy || 'System'}`, 140, 38);

    doc.line(14, 42, 196, 42);

    // Table Header
    let y = 50;
    doc.setFillColor(240, 244, 248);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('#', 16, y);
    doc.text('Lot No', 24, y);
    doc.text('Brand', 55, y);
    doc.text('Description', 90, y);
    doc.text('Part No', 135, y);
    doc.text('Sets', 160, y);
    doc.text('Pcs/Set', 175, y);
    doc.text('Qty', 190, y);

    doc.setFont('helvetica', 'normal');
    y += 8;

    const items = Array.isArray(billData.items) ? billData.items : [];
    let totalQty = 0;
    let totalSets = 0;

    items.forEach((item, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const sets = Number(item.sets) || 0;
      const qty = Number(item.quantity) || 0;
      totalSets += sets;
      totalQty += qty;

      doc.text(String(index + 1), 16, y);
      doc.text(String(item.lotNumber || '-').substring(0, 15), 24, y);
      doc.text(String(item.brand || '-').substring(0, 18), 55, y);
      doc.text(String(item.description || '-').substring(0, 25), 90, y);
      doc.text(String(item.partNo || '-').substring(0, 14), 135, y);
      doc.text(String(sets), 160, y);
      doc.text(String(item.setsPerPcs || '-'), 175, y);
      doc.text(String(qty), 190, y);

      y += 7;
    });

    doc.line(14, y, 196, y);
    y += 6;

    // Totals
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Items: ${items.length}`, 14, y);
    doc.text(`Total Sets: ${totalSets}`, 80, y);
    doc.text(`Total Quantity: ${totalQty} Pcs`, 140, y);

    const pdfArrayBuffer = doc.output('arraybuffer');
    return Buffer.from(pdfArrayBuffer);
  } catch (err) {
    console.error('Error generating PDF:', err);
    return null;
  }
};

// Generate Tally Style Dispatch Register PDF Buffer (For Daily, Weekly, Monthly Emails)
const generateTallyRegisterPDF = (reportTitle, periodStr, billsList) => {
  try {
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    const pageMargin = 14;
    const pageWidth = 210;
    const contentWidth = pageWidth - (pageMargin * 2);

    // Black & White Tally Title Box Header
    doc.setLineWidth(0.5);
    doc.rect(pageMargin, 12, contentWidth, 22);
    doc.setFont('courier', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('MH DISPATCH & STORE MANAGEMENT', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(reportTitle.toUpperCase(), 105, 28, { align: 'center' });

    // Metadata Bar
    let y = 40;
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text(`PERIOD / DATE: ${periodStr.toUpperCase()}`, pageMargin, y);
    doc.text(`STATUS: OFFICIAL TALLY REGISTER`, 196, y, { align: 'right' });
    doc.line(pageMargin, y + 2, 196, y + 2);

    y += 8;

    // Calculation
    let totalQty = 0;
    billsList.forEach(b => {
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length > 0) {
        items.forEach(i => { totalQty += (Number(i.quantity) || 0); });
      } else {
        totalQty += (Number(b.totalQuantity) || Number(b.calculatedQty) || 0);
      }
    });

    const uniqueParties = new Set(billsList.map(b => (b.partyName || b.party || '').trim())).size;

    // Summary Box
    doc.rect(pageMargin, y, contentWidth, 10);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text(`Total Bills: ${billsList.length}`, pageMargin + 4, y + 6);
    doc.text(`Parties Served: ${uniqueParties}`, pageMargin + 60, y + 6);
    doc.text(`Total Quantity: ${totalQty} Pcs`, pageMargin + 130, y + 6);

    y += 16;

    // Register Table Header
    doc.setFillColor(240, 240, 240);
    doc.rect(pageMargin, y - 5, contentWidth, 7, 'F');
    doc.rect(pageMargin, y - 5, contentWidth, 7, 'S');

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.text('#', pageMargin + 2, y);
    doc.text('VOUCHER / BILL NO', pageMargin + 12, y);
    doc.text('DATE', pageMargin + 52, y);
    doc.text('PARTY ACCOUNT NAME', pageMargin + 80, y);
    doc.text('TOTAL PCS', 194, y, { align: 'right' });

    y += 6;

    // Table Content Rows
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);

    billsList.forEach((bill, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
        // Repeat Header
        doc.setFillColor(240, 240, 240);
        doc.rect(pageMargin, y - 5, contentWidth, 7, 'F');
        doc.rect(pageMargin, y - 5, contentWidth, 7, 'S');
        doc.setFont('courier', 'bold');
        doc.text('#', pageMargin + 2, y);
        doc.text('VOUCHER / BILL NO', pageMargin + 12, y);
        doc.text('DATE', pageMargin + 52, y);
        doc.text('PARTY ACCOUNT NAME', pageMargin + 80, y);
        doc.text('TOTAL PCS', 194, y, { align: 'right' });
        doc.setFont('courier', 'normal');
        y += 6;
      }

      const items = Array.isArray(bill.items) ? bill.items : [];
      const billQty = items.length > 0 
        ? items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
        : (Number(bill.totalQuantity) || Number(bill.calculatedQty) || 0);

      const bDate = bill.billDate || (bill.createdDate ? bill.createdDate.split('T')[0] : '');
      const bDateFmt = bDate ? new Date(bDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase() : '-';
      const bNo = (bill.packingNumber || bill.billNumber || 'N/A').substring(0, 18);
      const party = (bill.partyName || bill.party || 'N/A').substring(0, 42);

      doc.text(String(index + 1), pageMargin + 2, y);
      doc.text(bNo, pageMargin + 12, y);
      doc.text(bDateFmt, pageMargin + 52, y);
      doc.text(party, pageMargin + 80, y);
      doc.setFont('courier', 'bold');
      doc.text(`${billQty} Pcs`, 194, y, { align: 'right' });
      doc.setFont('courier', 'normal');

      // Thin separator line
      doc.setLineWidth(0.1);
      doc.line(pageMargin, y + 2, 196, y + 2);
      y += 6;
    });

    // Grand Total Row
    y += 2;
    doc.setLineWidth(0.5);
    doc.line(pageMargin, y, 196, y);
    y += 5;
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.text('GRAND TOTAL REGISTER:', pageMargin + 80, y);
    doc.text(`${totalQty} Pcs`, 194, y, { align: 'right' });
    y += 2;
    doc.line(pageMargin, y, 196, y);
    doc.line(pageMargin, y + 1, 196, y + 1);

    // Signature Block
    y += 20;
    if (y > 275) {
      doc.addPage();
      y = 250;
    }
    doc.setFontSize(8);
    doc.text('Prepared By: Store Dispatch Desk', pageMargin, y);
    doc.text('Verified By: Store Manager / Accounts', 196, y, { align: 'right' });
    y += 6;
    doc.text('*** END OF TALLY OFFICIAL REGISTER STATEMENT ***', 105, y, { align: 'center' });

    const pdfArrayBuffer = doc.output('arraybuffer');
    return Buffer.from(pdfArrayBuffer);
  } catch (err) {
    console.error('Error generating Tally Register PDF:', err);
    return null;
  }
};

module.exports = {
  generatePackingListPDF,
  generateTallyRegisterPDF
};
