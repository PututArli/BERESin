import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PdfGridDensity, Project, Receipt } from "@/types/beresin";
import { formatRupiah, formatShortDateId, todayIsoDate } from "@/lib/format";

interface LoadedImageInfo {
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
}

function sanitizeFileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/\[.*?\]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lpj-beresinhahay"
  );
}

// Re-encode any receipt image onto a JPEG/PNG canvas so WebP/HEIC uploads embed cleanly into jsPDF.
function loadImageForPdf(src: string): Promise<LoadedImageInfo | null> {
  return new Promise((resolve) => {
    if (!src || typeof document === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
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
      resolve({
        dataUrl: jpegUrl,
        format: "JPEG",
        width: w,
        height: h,
      });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
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

  const totalSpent = receipts.reduce((sum, r) => sum + r.totalAmount, 0);
  const remainingBalance = project.initialBudget - totalSpent;
  const verifiedCount = receipts.filter((r) => r.status === "verified").length;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(22, 66, 49);
  doc.text("LAPORAN PERTANGGUNGJAWABAN KEUANGAN (LPJ)", marginX, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(24, 27, 25);
  doc.text(project.title, marginX, 26);

  doc.setDrawColor(22, 66, 49);
  doc.setLineWidth(0.7);
  doc.line(marginX, 30, pageWidth - marginX, 30);
  doc.setLineWidth(0.25);
  doc.line(marginX, 31.4, pageWidth - marginX, 31.4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(67, 75, 70);
  doc.text(`Tanggal Cetak: ${formatShortDateId(todayIsoDate())}`, marginX, 37);
  doc.text(
    `Status Bukti: ${verifiedCount} dari ${receipts.length} nota telah disahkan`,
    pageWidth - marginX,
    37,
    { align: "right" }
  );

  if (project.isSimulation) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(168, 40, 25);
    doc.text(
      "CATATAN: Dokumen ini dicetak dari proyek berlabel [DATA SIMULASI].",
      marginX,
      43
    );
  }

  const summaryStartY = project.isSimulation ? 47 : 42;
  autoTable(doc, {
    startY: summaryStartY,
    margin: { left: marginX, right: marginX },
    head: [["Dana Awal / Pemasukan", "Total Pengeluaran", "Sisa Saldo Akhir", "Jumlah Bukti Nota"]],
    body: [
      [
        formatRupiah(project.initialBudget),
        formatRupiah(totalSpent),
        formatRupiah(remainingBalance),
        `${receipts.length} Nota`,
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: [236, 230, 218],
      textColor: [24, 27, 25],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      textColor: [24, 27, 25],
      fontStyle: "bold",
      fontSize: 10,
    },
  });

  const afterSummaryY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? summaryStartY + 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(24, 27, 25);
  doc.text("Tabel Rekapitulasi Pengeluaran", marginX, afterSummaryY + 9);

  const tableRows = receipts.map((r) => [
    `#${r.referenceNumber}`,
    formatShortDateId(r.transactionDate),
    r.merchantName,
    r.category,
    r.status === "verified" ? "Sah" : "Perlu Cek",
    formatRupiah(r.totalAmount),
  ]);

  tableRows.push([
    "",
    "",
    "TOTAL PENGELUARAN",
    "",
    "",
    formatRupiah(totalSpent),
  ]);

  autoTable(doc, {
    startY: afterSummaryY + 12,
    margin: { left: marginX, right: marginX },
    head: [["No. Ref", "Tanggal", "Uraian / Nama Toko", "Pos Anggaran", "Status", "Nominal"]],
    body: tableRows,
    theme: "grid",
    headStyles: {
      fillColor: [22, 66, 49],
      textColor: [253, 251, 247],
      fontStyle: "bold",
      fontSize: 8.8,
    },
    bodyStyles: {
      textColor: [24, 27, 25],
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: "bold" },
      1: { cellWidth: 25 },
      3: { cellWidth: 28 },
      4: { cellWidth: 20 },
      5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
    },
  });

  let sigY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? 180) + 16;

  if (sigY + 42 > pageHeight - 14) {
    doc.addPage();
    sigY = 26;
  }

  // Blok Tanda Tangan Ketua Pelaksana & Bendahara (PRD Bagian 6.3)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(24, 27, 25);

  const leftColCenter = marginX + 42;
  const rightColCenter = pageWidth - marginX - 42;

  doc.text("Mengetahui,", leftColCenter, sigY, { align: "center" });
  doc.text("Ketua Pelaksana", leftColCenter, sigY + 5, { align: "center" });

  doc.text(`Disusun pada ${formatShortDateId(todayIsoDate())},`, rightColCenter, sigY, {
    align: "center",
  });
  doc.text("Bendahara Kegiatan", rightColCenter, sigY + 5, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.text(
    project.chairpersonName || "( ........................................ )",
    leftColCenter,
    sigY + 30,
    { align: "center" }
  );
  doc.text(
    project.treasurerName || "( ........................................ )",
    rightColCenter,
    sigY + 30,
    { align: "center" }
  );

  // Halaman 2 dst: Lampiran Bukti Foto Nota (2x2 = 4 per halaman atau 2x3 = 6 per halaman)
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
      receipts.map((r) => loadImageForPdf(r.imageUrl))
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
          `LAMPIRAN BUKTI NOTA: ${project.title.slice(0, 52)} (Lembar ${attachmentPageNum})`,
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

      const headerTitle = `[ #${r.referenceNumber} ] - ${formatShortDateId(r.transactionDate)}`;
      const subHeader = `${r.merchantName.slice(0, 26)} (${formatRupiah(r.totalAmount)})`;

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
          "Gambar nota tidak tersedia",
          cellX + cellWidth / 2,
          cellY + cellHeight / 2,
          { align: "center" }
        );
      }

      doc.setFontSize(7);
      doc.setTextColor(82, 91, 85);
      doc.text(
        `Pos: ${r.category} | Bayar: ${r.paymentMethod} | Status: ${
          r.status === "verified" ? "Sah" : "Perlu Dicek"
        }`,
        cellX + 2.5,
        cellY + cellHeight - 2
      );
    }
  }

  const fileName = `Lampiran-LPJ-${sanitizeFileSlug(project.title)}-${todayIsoDate()}.pdf`;
  doc.save(fileName);
}
