import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PdfGridDensity, Project, Receipt } from "@/types/beresin";
import { formatRupiah, formatShortDateId } from "@/lib/format";
import { computeLpjNarrative } from "@/lib/lpj-narrative";
import { sanitizePlainText } from "@/lib/security";

export interface LoadedImageInfo {
  dataUrl: string;
  base64Bytes: string;
  format: "JPEG";
  width: number;
  height: number;
}

// Re-encodes any receipt image onto a JPEG canvas so WebP/PNG uploads embed cleanly into PDF and DOCX.
export function loadImageAsJpeg(src: string): Promise<LoadedImageInfo | null> {
  return new Promise((resolve) => {
    if (!src || typeof document === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 600;
      const h = img.naturalHeight || 800;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const jpegUrl = canvas.toDataURL("image/jpeg", 0.86);
      const base64Bytes = jpegUrl.replace(/^data:image\/jpeg;base64,/, "");
      resolve({
        dataUrl: jpegUrl,
        base64Bytes,
        format: "JPEG",
        width: w,
        height: h,
      });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawWrappedParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  pageHeight: number,
  lineHeight = 4.8
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  let curY = startY;
  for (const line of lines) {
    if (curY > pageHeight - 18) {
      doc.addPage();
      curY = 20;
    }
    doc.text(line, x, curY);
    curY += lineHeight;
  }
  return curY;
}

export async function exportProjectToPdfLpj(
  project: Project,
  receipts: Receipt[],
  gridDensity: PdfGridDensity = "2x2"
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const narrative = computeLpjNarrative(project, receipts);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(22, 66, 49);
  doc.text("LAPORAN PERTANGGUNGJAWABAN KEUANGAN (LPJ)", marginX, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(24, 27, 25);
  const titleLines = doc.splitTextToSize(narrative.safeTitle, contentWidth) as string[];
  let cursorY = 25.5;
  for (const line of titleLines) {
    doc.text(line, marginX, cursorY);
    cursorY += 6.2;
  }

  const ruleY = cursorY - 2;
  doc.setDrawColor(22, 66, 49);
  doc.setLineWidth(0.7);
  doc.line(marginX, ruleY, pageWidth - marginX, ruleY);
  doc.setLineWidth(0.25);
  doc.line(marginX, ruleY + 1.4, pageWidth - marginX, ruleY + 1.4);

  cursorY = ruleY + 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  doc.setTextColor(67, 75, 70);
  doc.text(`Tanggal Penyusunan: ${narrative.printDateLabel}`, marginX, cursorY);
  doc.text(
    `Jumlah Bukti: ${receipts.length} nota (${narrative.verifiedCount} sudah dicek)`,
    pageWidth - marginX,
    cursorY,
    { align: "right" }
  );

  cursorY += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(22, 66, 49);
  doc.text("I. Uraian Pertanggungjawaban Dana", marginX, cursorY);

  cursorY += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 27, 25);
  cursorY = drawWrappedParagraph(
    doc,
    narrative.openingParagraph,
    marginX,
    cursorY,
    contentWidth,
    pageHeight
  );
  cursorY += 2;
  cursorY = drawWrappedParagraph(
    doc,
    narrative.financialParagraph,
    marginX,
    cursorY,
    contentWidth,
    pageHeight
  );
  cursorY += 2;
  cursorY = drawWrappedParagraph(
    doc,
    narrative.categoryParagraph,
    marginX,
    cursorY,
    contentWidth,
    pageHeight
  );

  cursorY += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(22, 66, 49);
  doc.text("II. Ringkasan Dana", marginX, cursorY);

  autoTable(doc, {
    startY: cursorY + 3,
    margin: { left: marginX, right: marginX },
    head: [
      [
        "Dana Awal / Pemasukan",
        "Total Pengeluaran",
        "Sisa / Selisih Dana",
        "Jumlah Bukti Nota",
      ],
    ],
    body: [
      [
        narrative.initialBudgetDisplay,
        formatRupiah(narrative.totalSpent),
        narrative.remainingBalanceDisplay,
        `${receipts.length} Nota`,
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: [236, 230, 218],
      textColor: [24, 27, 25],
      fontStyle: "bold",
      fontSize: 8.8,
    },
    bodyStyles: {
      textColor: [24, 27, 25],
      fontStyle: "bold",
      fontSize: 9.8,
    },
  });

  let afterSummaryY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? cursorY + 22;

  if (afterSummaryY > pageHeight - 36) {
    doc.addPage();
    afterSummaryY = 18;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(22, 66, 49);
  doc.text("III. Daftar Rincian Pengeluaran per Nota", marginX, afterSummaryY + 8);

  const tableRows = receipts.map((r) => [
    `#${sanitizePlainText(r.referenceNumber, 24)}`,
    formatShortDateId(r.transactionDate),
    sanitizePlainText(r.merchantName, 90),
    sanitizePlainText(r.category, 40),
    r.status === "verified" ? "Sudah pas" : "Perlu dicek",
    formatRupiah(r.totalAmount),
  ]);

  tableRows.push([
    "",
    "",
    "TOTAL PENGELUARAN",
    "",
    "",
    formatRupiah(narrative.totalSpent),
  ]);

  autoTable(doc, {
    startY: afterSummaryY + 11,
    margin: { left: marginX, right: marginX },
    head: [
      [
        "Kode Nota",
        "Tanggal",
        "Nama Toko / Keperluan",
        "Kategori",
        "Status",
        "Jumlah (Rp)",
      ],
    ],
    body: tableRows,
    theme: "grid",
    headStyles: {
      fillColor: [22, 66, 49],
      textColor: [253, 251, 247],
      fontStyle: "bold",
      fontSize: 8.6,
    },
    bodyStyles: {
      textColor: [24, 27, 25],
      fontSize: 8.4,
    },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: "bold" },
      1: { cellWidth: 25 },
      3: { cellWidth: 28 },
      4: { cellWidth: 22 },
      5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
    },
  });

  let closingY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? 180) + 8;

  if (closingY > pageHeight - 65) {
    doc.addPage();
    closingY = 22;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(22, 66, 49);
  doc.text("IV. Penutup & Pengesahan", marginX, closingY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 27, 25);
  let sigY =
    drawWrappedParagraph(
      doc,
      narrative.closingParagraph,
      marginX,
      closingY + 5.5,
      contentWidth,
      pageHeight
    ) + 9;

  if (sigY + 38 > pageHeight - 14) {
    doc.addPage();
    sigY = 26;
  }

  const leftColCenter = marginX + 42;
  const rightColCenter = pageWidth - marginX - 42;

  doc.text("Mengetahui,", leftColCenter, sigY, { align: "center" });
  doc.text("Ketua Pelaksana / Penanggung Jawab", leftColCenter, sigY + 5, {
    align: "center",
  });

  doc.text(`Disusun pada ${narrative.printDateLabel},`, rightColCenter, sigY, {
    align: "center",
  });
  doc.text("Bendahara / Penyusun Laporan", rightColCenter, sigY + 5, {
    align: "center",
  });

  doc.setFont("helvetica", "bold");
  doc.text(narrative.chairpersonLabel, leftColCenter, sigY + 29, {
    align: "center",
  });
  doc.text(narrative.treasurerLabel, rightColCenter, sigY + 29, {
    align: "center",
  });

  // Attachment pages: 2x2 (4 per A4) or 2x3 (6 per A4) receipt photo grid.
  if (receipts.length > 0) {
    const cols = 2;
    const rows = gridDensity === "2x3" ? 3 : 2;
    const perPage = cols * rows;
    const gapX = 6;
    const gapY = 6;
    const topGridY = 24;
    const bottomMargin = 14;
    const availableHeight = pageHeight - topGridY - bottomMargin;
    const cellWidth = (contentWidth - gapX * (cols - 1)) / cols;
    const cellHeight = (availableHeight - gapY * (rows - 1)) / rows;
    const headerBarH = 11;

    const loadedImages = await Promise.all(
      receipts.map((r) => loadImageAsJpeg(r.imageUrl))
    );

    for (let i = 0; i < receipts.length; i += 1) {
      const slotInPage = i % perPage;
      if (slotInPage === 0) {
        doc.addPage();
        const attachmentPageNum = Math.floor(i / perPage) + 1;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(22, 66, 49);
        doc.text(
          `LAMPIRAN FOTO BUKTI STRUK: ${narrative.safeTitle.slice(0, 48)} (Hal. ${attachmentPageNum})`,
          marginX,
          16
        );
        doc.setDrawColor(112, 122, 115);
        doc.setLineWidth(0.3);
        doc.line(marginX, 19, pageWidth - marginX, 19);
      }

      const colIdx = slotInPage % cols;
      const rowIdx = Math.floor(slotInPage / cols);
      const cellX = marginX + colIdx * (cellWidth + gapX);
      const cellY = topGridY + rowIdx * (cellHeight + gapY);
      const r = receipts[i];

      doc.setDrawColor(112, 122, 115);
      doc.setLineWidth(0.35);
      doc.rect(cellX, cellY, cellWidth, cellHeight);

      doc.setFillColor(236, 230, 218);
      doc.rect(cellX, cellY, cellWidth, headerBarH, "F");
      doc.line(cellX, cellY + headerBarH, cellX + cellWidth, cellY + headerBarH);

      const headerTitle = `[ #${sanitizePlainText(r.referenceNumber, 24)} ] · ${formatShortDateId(
        r.transactionDate
      )}`;
      const subHeader = `${sanitizePlainText(r.merchantName, 26)} (${formatRupiah(
        r.totalAmount
      )})`;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      doc.setTextColor(24, 27, 25);
      doc.text(headerTitle, cellX + 2.5, cellY + 4.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(67, 75, 70);
      doc.text(subHeader, cellX + 2.5, cellY + 9.2);

      const pad = 3;
      const boxX = cellX + pad;
      const boxY = cellY + headerBarH + pad;
      const boxW = cellWidth - pad * 2;
      const boxH = cellHeight - headerBarH - pad * 2 - 5;

      const imgData = loadedImages[i];
      if (imgData) {
        const scale = Math.min(boxW / imgData.width, boxH / imgData.height);
        const drawW = imgData.width * scale;
        const drawH = imgData.height * scale;
        const drawX = boxX + (boxW - drawW) / 2;
        const drawY = boxY + (boxH - drawH) / 2;
        doc.addImage(imgData.dataUrl, imgData.format, drawX, drawY, drawW, drawH);
      } else {
        doc.setFontSize(8);
        doc.setTextColor(112, 122, 115);
        doc.text(
          "Gambar struk tidak tersedia",
          cellX + cellWidth / 2,
          cellY + cellHeight / 2,
          { align: "center" }
        );
      }

      doc.setFontSize(7);
      doc.setTextColor(82, 91, 85);
      doc.text(
        `Kategori: ${sanitizePlainText(r.category, 24)} | Bayar: ${
          r.paymentMethod
        } | ${r.status === "verified" ? "Sudah pas" : "Perlu dicek"}`,
        cellX + 2.5,
        cellY + cellHeight - 2
      );
    }
  }

  const fileName = `LPJ-${narrative.fileSlug}-${narrative.todayIso}.pdf`;
  doc.save(fileName);
}
