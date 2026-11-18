import JSZip from "jszip";
import type { Project, Receipt } from "@/types/beresin";
import { formatRupiah, formatShortDateId } from "@/lib/format";
import { loadImageAsJpeg } from "@/lib/export-pdf";
import { computeLpjNarrative } from "@/lib/lpj-narrative";
import { sanitizePlainText, sanitizeSpreadsheetCell } from "@/lib/security";

function triggerDownloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value: string): string {
  return escapeXml(value);
}

function wParagraph(
  text: string,
  opts?: {
    bold?: boolean;
    sizeHalfPt?: number;
    colorHex?: string;
    align?: "left" | "center" | "right" | "both";
    spaceAfterTwips?: number;
    spaceBeforeTwips?: number;
  }
): string {
  const alignTag = opts?.align ? `<w:jc w:val="${opts.align}"/>` : "";
  const spacingTag = `<w:spacing w:before="${opts?.spaceBeforeTwips ?? 0}" w:after="${
    opts?.spaceAfterTwips ?? 140
  }" w:line="276" w:lineRule="auto"/>`;
  const boldTag = opts?.bold ? "<w:b/>" : "";
  const colorTag = opts?.colorHex ? `<w:color w:val="${opts.colorHex}"/>` : "";
  const sz = opts?.sizeHalfPt ?? 21;
  return `<w:p><w:pPr>${alignTag}${spacingTag}</w:pPr><w:r><w:rPr>${boldTag}${colorTag}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${escapeXml(
    text
  )}</w:t></w:r></w:p>`;
}

function wTableCell(
  text: string,
  opts?: {
    bold?: boolean;
    align?: "left" | "center" | "right";
    fillHex?: string;
    textColorHex?: string;
    widthDxa?: number;
  }
): string {
  const tcW = opts?.widthDxa
    ? `<w:tcW w:w="${opts.widthDxa}" w:type="dxa"/>`
    : `<w:tcW w:w="0" w:type="auto"/>`;
  const shd = opts?.fillHex
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.fillHex}"/>`
    : "";
  const pAlign = opts?.align ? `<w:jc w:val="${opts.align}"/>` : "";
  const bold = opts?.bold ? "<w:b/>" : "";
  const color = opts?.textColorHex ? `<w:color w:val="${opts.textColorHex}"/>` : "";
  return `<w:tc><w:tcPr>${tcW}${shd}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr>${pAlign}<w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr>${bold}${color}<w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><w:t xml:space="preserve">${escapeXml(
    text
  )}</w:t></w:r></w:p></w:tc>`;
}

function wGridTable(rowsXml: string[]): string {
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="707A73"/><w:left w:val="single" w:sz="6" w:space="0" w:color="707A73"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="707A73"/><w:right w:val="single" w:sz="6" w:space="0" w:color="707A73"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="B8C0BA"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="B8C0BA"/></w:tblBorders></w:tblPr>${rowsXml.join(
    ""
  )}</w:tbl>`;
}

function wImageParagraph(
  relId: string,
  docPrId: number,
  widthPx: number,
  heightPx: number
): string {
  // Fit receipt image inside max 78mm x 104mm (1 mm = 36000 EMU) while keeping original aspect ratio.
  const maxW = 78 * 36000;
  const maxH = 104 * 36000;
  const safeW = Math.max(1, widthPx);
  const safeH = Math.max(1, heightPx);
  const scale = Math.min(maxW / safeW, maxH / safeH);
  const cx = Math.round(safeW * scale);
  const cy = Math.round(safeH * scale);

  return `<w:p><w:pPr><w:spacing w:before="60" w:after="180"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="Nota ${docPrId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="nota_${docPrId}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

export async function exportProjectToDocx(
  project: Project,
  receipts: Receipt[]
): Promise<void> {
  const narrative = computeLpjNarrative(project, receipts);
  const zip = new JSZip();

  const loadedImages = await Promise.all(
    receipts.map((r) => loadImageAsJpeg(r.imageUrl))
  );

  const relEntries: string[] = [
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ];

  const imageRelByIndex = new Map<number, string>();
  for (let i = 0; i < loadedImages.length; i += 1) {
    const img = loadedImages[i];
    if (!img) continue;
    const relId = `rIdImg${i + 1}`;
    const mediaPath = `media/nota_${i + 1}.jpeg`;
    zip.file(`word/${mediaPath}`, img.base64Bytes, { base64: true });
    relEntries.push(
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaPath}"/>`
    );
    imageRelByIndex.set(i, relId);
  }

  const bodyParts: string[] = [];

  bodyParts.push(
    wParagraph("LAPORAN PERTANGGUNGJAWABAN KEUANGAN (LPJ)", {
      bold: true,
      sizeHalfPt: 26,
      colorHex: "164231",
      spaceAfterTwips: 60,
    })
  );
  bodyParts.push(
    wParagraph(narrative.safeTitle, {
      bold: true,
      sizeHalfPt: 30,
      colorHex: "181B19",
      spaceAfterTwips: 100,
    })
  );
  bodyParts.push(
    wParagraph(
      `Tanggal Penyusunan: ${narrative.printDateLabel}  |  Jumlah Bukti: ${receipts.length} nota (${narrative.verifiedCount} sudah dicek)`,
      { sizeHalfPt: 19, colorHex: "434B46", spaceAfterTwips: 220 }
    )
  );

  bodyParts.push(
    wParagraph("I. Uraian Pertanggungjawaban Dana", {
      bold: true,
      sizeHalfPt: 23,
      colorHex: "164231",
      spaceBeforeTwips: 80,
      spaceAfterTwips: 100,
    })
  );
  bodyParts.push(wParagraph(narrative.openingParagraph, { align: "both" }));
  bodyParts.push(wParagraph(narrative.financialParagraph, { align: "both" }));
  bodyParts.push(wParagraph(narrative.categoryParagraph, { align: "both" }));

  bodyParts.push(
    wParagraph("II. Ringkasan Dana & Kategori", {
      bold: true,
      sizeHalfPt: 23,
      colorHex: "164231",
      spaceBeforeTwips: 160,
      spaceAfterTwips: 100,
    })
  );

  const summaryTableRows = [
    `<w:tr>${[
      wTableCell("Dana Awal / Pemasukan", { bold: true, fillHex: "ECE6DA" }),
      wTableCell("Total Pengeluaran", { bold: true, fillHex: "ECE6DA" }),
      wTableCell("Sisa / Selisih Dana", { bold: true, fillHex: "ECE6DA" }),
      wTableCell("Jumlah Bukti Nota", { bold: true, fillHex: "ECE6DA" }),
    ].join("")}</w:tr>`,
    `<w:tr>${[
      wTableCell(narrative.initialBudgetDisplay, { bold: true }),
      wTableCell(formatRupiah(narrative.totalSpent), { bold: true }),
      wTableCell(narrative.remainingBalanceDisplay, { bold: true }),
      wTableCell(`${receipts.length} Nota`, { bold: true }),
    ].join("")}</w:tr>`,
  ];
  bodyParts.push(wGridTable(summaryTableRows));
  bodyParts.push(wParagraph("", { spaceAfterTwips: 80 }));

  const catTableRows = [
    `<w:tr>${[
      wTableCell("Kategori Pengeluaran", {
        bold: true,
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Jumlah Nota", {
        bold: true,
        align: "center",
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Total (Rp)", {
        bold: true,
        align: "right",
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Porsi (%)", {
        bold: true,
        align: "right",
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
    ].join("")}</w:tr>`,
    ...narrative.categoryRows.map(
      (c) =>
        `<w:tr>${[
          wTableCell(c.category),
          wTableCell(String(c.count), { align: "center" }),
          wTableCell(formatRupiah(c.amount), { align: "right" }),
          wTableCell(`${c.pct}%`, { align: "right" }),
        ].join("")}</w:tr>`
    ),
  ];
  bodyParts.push(wGridTable(catTableRows));

  bodyParts.push(
    wParagraph("III. Daftar Pengeluaran per Nota", {
      bold: true,
      sizeHalfPt: 23,
      colorHex: "164231",
      spaceBeforeTwips: 200,
      spaceAfterTwips: 100,
    })
  );

  const receiptTableRows = [
    `<w:tr>${[
      wTableCell("Kode Nota", {
        bold: true,
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Tanggal", {
        bold: true,
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Nama Toko / Keperluan", {
        bold: true,
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Kategori", {
        bold: true,
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Cara Bayar", {
        bold: true,
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
      wTableCell("Jumlah (Rp)", {
        bold: true,
        align: "right",
        fillHex: "164231",
        textColorHex: "FDFBF7",
      }),
    ].join("")}</w:tr>`,
    ...receipts.map(
      (r) =>
        `<w:tr>${[
          wTableCell(`#${sanitizePlainText(r.referenceNumber, 24)}`, { bold: true }),
          wTableCell(formatShortDateId(r.transactionDate)),
          wTableCell(sanitizePlainText(r.merchantName, 90)),
          wTableCell(sanitizePlainText(r.category, 40)),
          wTableCell(r.paymentMethod),
          wTableCell(formatRupiah(r.totalAmount), { bold: true, align: "right" }),
        ].join("")}</w:tr>`
    ),
    `<w:tr>${[
      wTableCell("", { fillHex: "ECE6DA" }),
      wTableCell("", { fillHex: "ECE6DA" }),
      wTableCell("TOTAL PENGELUARAN", { bold: true, fillHex: "ECE6DA" }),
      wTableCell("", { fillHex: "ECE6DA" }),
      wTableCell("", { fillHex: "ECE6DA" }),
      wTableCell(formatRupiah(narrative.totalSpent), {
        bold: true,
        align: "right",
        fillHex: "ECE6DA",
      }),
    ].join("")}</w:tr>`,
  ];
  bodyParts.push(wGridTable(receiptTableRows));

  const detailedItems = receipts.flatMap((r) =>
    r.items.map((it) => ({
      ref: r.referenceNumber,
      merchant: r.merchantName,
      name: it.itemName,
      qty: it.quantity,
      unit: it.unitPrice,
      total: it.totalPrice,
    }))
  );

  if (detailedItems.length > 0) {
    bodyParts.push(
      wParagraph("IV. Rincian Barang yang Dibeli", {
        bold: true,
        sizeHalfPt: 23,
        colorHex: "164231",
        spaceBeforeTwips: 200,
        spaceAfterTwips: 100,
      })
    );

    const itemTableRows = [
      `<w:tr>${[
        wTableCell("Kode Nota", { bold: true, fillHex: "ECE6DA" }),
        wTableCell("Nama Toko", { bold: true, fillHex: "ECE6DA" }),
        wTableCell("Nama Barang", { bold: true, fillHex: "ECE6DA" }),
        wTableCell("Jumlah", { bold: true, align: "center", fillHex: "ECE6DA" }),
        wTableCell("Harga Satuan", { bold: true, align: "right", fillHex: "ECE6DA" }),
        wTableCell("Subtotal", { bold: true, align: "right", fillHex: "ECE6DA" }),
      ].join("")}</w:tr>`,
      ...detailedItems.map(
        (it) =>
          `<w:tr>${[
            wTableCell(`#${sanitizePlainText(it.ref, 24)}`),
            wTableCell(sanitizePlainText(it.merchant, 60)),
            wTableCell(sanitizePlainText(it.name, 90)),
            wTableCell(String(it.qty), { align: "center" }),
            wTableCell(formatRupiah(it.unit), { align: "right" }),
            wTableCell(formatRupiah(it.total), { align: "right" }),
          ].join("")}</w:tr>`
      ),
    ];
    bodyParts.push(wGridTable(itemTableRows));
  }

  bodyParts.push(
    wParagraph("Penutup & Lembar Pengesahan", {
      bold: true,
      sizeHalfPt: 23,
      colorHex: "164231",
      spaceBeforeTwips: 220,
      spaceAfterTwips: 100,
    })
  );
  bodyParts.push(wParagraph(narrative.closingParagraph, { align: "both" }));

  const sigTable = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tr><w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>${wParagraph(
    "Mengetahui,",
    { align: "center", spaceBeforeTwips: 140, spaceAfterTwips: 20 }
  )}${wParagraph("Ketua Pelaksana / Penanggung Jawab", {
    align: "center",
    spaceAfterTwips: 760,
  })}${wParagraph(narrative.chairpersonLabel, {
    bold: true,
    align: "center",
    spaceAfterTwips: 120,
  })}</w:tc><w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>${wParagraph(
    `Disusun pada ${narrative.printDateLabel},`,
    { align: "center", spaceBeforeTwips: 140, spaceAfterTwips: 20 }
  )}${wParagraph("Bendahara / Penyusun Laporan", {
    align: "center",
    spaceAfterTwips: 760,
  })}${wParagraph(narrative.treasurerLabel, {
    bold: true,
    align: "center",
    spaceAfterTwips: 120,
  })}</w:tc></w:tr></w:tbl>`;
  bodyParts.push(sigTable);

  if (receipts.length > 0) {
    bodyParts.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    bodyParts.push(
      wParagraph("Lampiran Foto Bukti Struk", {
        bold: true,
        sizeHalfPt: 25,
        colorHex: "164231",
        spaceAfterTwips: 140,
      })
    );

    for (let i = 0; i < receipts.length; i += 1) {
      const r = receipts[i];
      const relId = imageRelByIndex.get(i);
      const img = loadedImages[i];
      bodyParts.push(
        wParagraph(
          `[ #${sanitizePlainText(r.referenceNumber, 24)} ] · ${formatShortDateId(
            r.transactionDate
          )} · ${sanitizePlainText(r.merchantName, 80)} · ${formatRupiah(r.totalAmount)}`,
          { bold: true, sizeHalfPt: 20, spaceBeforeTwips: 100, spaceAfterTwips: 40 }
        )
      );
      if (relId && img) {
        bodyParts.push(wImageParagraph(relId, i + 1, img.width, img.height));
      }
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyParts.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:lang w:val="id-ID"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relEntries.join("\n  ")}
</Relationships>`;

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", rootRelsXml);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", stylesXml);
  zip.file("word/_rels/document.xml.rels", docRelsXml);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  triggerDownloadBlob(blob, `LPJ-${narrative.fileSlug}-${narrative.todayIso}.docx`);
}

function escapeCsvCell(raw: string | number): string {
  const str =
    typeof raw === "number" ? String(raw) : sanitizeSpreadsheetCell(String(raw));
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportProjectToCsv(project: Project, receipts: Receipt[]): void {
  const narrative = computeLpjNarrative(project, receipts);
  const lines: string[] = [];

  lines.push(
    [
      "Judul Laporan",
      narrative.safeTitle,
      "Tanggal Unduh",
      narrative.printDateLabel,
    ]
      .map(escapeCsvCell)
      .join(",")
  );
  lines.push(["Uraian Pembuka", narrative.openingParagraph].map(escapeCsvCell).join(","));
  lines.push(["Ringkasan Dana", narrative.financialParagraph].map(escapeCsvCell).join(","));
  lines.push("");
  lines.push(
    [
      "Kode Nota",
      "Tanggal Beli",
      "Nama Toko",
      "Kategori",
      "Cara Bayar",
      "Nama Barang / Rincian",
      "Jumlah Barang",
      "Harga Satuan (Rp)",
      "Subtotal Baris (Rp)",
      "Total Nota (Rp)",
      "Status Cek",
      "Catatan",
    ]
      .map(escapeCsvCell)
      .join(",")
  );

  for (const r of receipts) {
    const statusText = r.status === "verified" ? "Sudah pas" : "Perlu dicek";
    if (r.items.length === 0) {
      lines.push(
        [
          r.referenceNumber,
          r.transactionDate ?? "-",
          r.merchantName,
          r.category,
          r.paymentMethod,
          "(Total langsung)",
          1,
          r.totalAmount,
          r.totalAmount,
          r.totalAmount,
          statusText,
          r.notes || "-",
        ]
          .map(escapeCsvCell)
          .join(",")
      );
      continue;
    }

    r.items.forEach((item, idx) => {
      lines.push(
        [
          r.referenceNumber,
          r.transactionDate ?? "-",
          r.merchantName,
          r.category,
          r.paymentMethod,
          item.itemName,
          item.quantity,
          item.unitPrice,
          item.totalPrice,
          idx === 0 ? r.totalAmount : "",
          idx === 0 ? statusText : "",
          idx === 0 ? r.notes || "-" : "",
        ]
          .map(escapeCsvCell)
          .join(",")
      );
    });
  }

  // UTF-8 BOM ensures Excel on Windows opens Indonesian columns cleanly without garbled characters.
  const csvContent = `\uFEFF${lines.join("\r\n")}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownloadBlob(blob, `LPJ-${narrative.fileSlug}-${narrative.todayIso}.csv`);
}

export function exportProjectToHtml(project: Project, receipts: Receipt[]): void {
  const narrative = computeLpjNarrative(project, receipts);

  const receiptRowsHtml = receipts
    .map(
      (r) => `<tr>
        <td><strong>#${escapeHtml(sanitizePlainText(r.referenceNumber, 24))}</strong></td>
        <td>${escapeHtml(formatShortDateId(r.transactionDate))}</td>
        <td>${escapeHtml(sanitizePlainText(r.merchantName, 90))}</td>
        <td>${escapeHtml(sanitizePlainText(r.category, 40))}</td>
        <td>${escapeHtml(r.paymentMethod)}</td>
        <td style="text-align:right"><strong>${escapeHtml(
          formatRupiah(r.totalAmount)
        )}</strong></td>
      </tr>`
    )
    .join("\n");

  const galleryHtml = receipts
    .map(
      (r) => `<figure class="card">
        <figcaption><strong>#${escapeHtml(
          sanitizePlainText(r.referenceNumber, 24)
        )}</strong> · ${escapeHtml(formatShortDateId(r.transactionDate))}<br/>${escapeHtml(
        sanitizePlainText(r.merchantName, 60)
      )} (${escapeHtml(formatRupiah(r.totalAmount))})</figcaption>
        <img src="${escapeHtml(r.imageUrl)}" alt="Bukti ${escapeHtml(
        sanitizePlainText(r.referenceNumber, 24)
      )}" />
      </figure>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LPJ - ${escapeHtml(narrative.safeTitle)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; color: #181b19; background: #fdfbf7; max-width: 860px; margin: 24px auto; padding: 0 20px 48px; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin: 4px 0 6px; color: #181b19; }
    h2 { font-size: 1.08rem; color: #164231; margin-top: 24px; border-bottom: 1px solid #c5bdb0; padding-bottom: 4px; }
    .kicker { font-weight: 700; color: #164231; font-size: 0.9rem; text-transform: uppercase; }
    .meta { font-size: 0.88rem; color: #434b46; border-top: 2px solid #164231; padding-top: 8px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 0.9rem; }
    th, td { border: 1px solid #707a73; padding: 7px 9px; text-align: left; vertical-align: top; }
    th { background: #164231; color: #fdfbf7; }
    .summary th { background: #ece6da; color: #181b19; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; text-align: center; }
    .sig-space { height: 68px; }
    .gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 12px; }
    .card { border: 1px solid #707a73; border-radius: 6px; padding: 8px; margin: 0; background: #fff; break-inside: avoid; }
    .card figcaption { font-size: 0.8rem; margin-bottom: 8px; border-bottom: 1px solid #dcd5c7; padding-bottom: 5px; }
    .card img { width: 100%; max-height: 320px; object-fit: contain; display: block; margin: 0 auto; }
    @media (max-width: 600px) { .gallery, .sig-grid { grid-template-columns: 1fr; } }
    @media print { body { background: #fff; margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <div class="kicker">Laporan Pertanggungjawaban Keuangan (LPJ)</div>
  <h1>${escapeHtml(narrative.safeTitle)}</h1>
  <div class="meta">Tanggal Penyusunan: ${escapeHtml(
    narrative.printDateLabel
  )} · Jumlah Bukti: ${receipts.length} nota (${narrative.verifiedCount} sudah dicek)</div>

  <h2>I. Uraian Pertanggungjawaban Dana</h2>
  <p>${escapeHtml(narrative.openingParagraph)}</p>
  <p>${escapeHtml(narrative.financialParagraph)}</p>
  <p>${escapeHtml(narrative.categoryParagraph)}</p>

  <h2>II. Ringkasan Dana</h2>
  <table class="summary">
    <thead>
      <tr><th>Dana Awal / Pemasukan</th><th>Total Pengeluaran</th><th>Sisa / Selisih Dana</th><th>Jumlah Bukti</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${escapeHtml(narrative.initialBudgetDisplay)}</strong></td>
        <td><strong>${escapeHtml(formatRupiah(narrative.totalSpent))}</strong></td>
        <td><strong>${escapeHtml(narrative.remainingBalanceDisplay)}</strong></td>
        <td><strong>${receipts.length} Nota</strong></td>
      </tr>
    </tbody>
  </table>

  <h2>III. Daftar Pengeluaran per Nota</h2>
  <table>
    <thead>
      <tr><th>Kode Nota</th><th>Tanggal</th><th>Nama Toko / Keperluan</th><th>Kategori</th><th>Cara Bayar</th><th style="text-align:right">Jumlah</th></tr>
    </thead>
    <tbody>
      ${receiptRowsHtml}
      <tr>
        <td colspan="5"><strong>TOTAL PENGELUARAN</strong></td>
        <td style="text-align:right"><strong>${escapeHtml(
          formatRupiah(narrative.totalSpent)
        )}</strong></td>
      </tr>
    </tbody>
  </table>

  <h2>IV. Penutup &amp; Pengesahan</h2>
  <p>${escapeHtml(narrative.closingParagraph)}</p>

  <div class="sig-grid">
    <div>
      <div>Mengetahui,<br/>Ketua Pelaksana / Penanggung Jawab</div>
      <div class="sig-space"></div>
      <div><strong>${escapeHtml(narrative.chairpersonLabel)}</strong></div>
    </div>
    <div>
      <div>Disusun pada ${escapeHtml(narrative.printDateLabel)},<br/>Bendahara / Penyusun Laporan</div>
      <div class="sig-space"></div>
      <div><strong>${escapeHtml(narrative.treasurerLabel)}</strong></div>
    </div>
  </div>

  ${
    receipts.length > 0
      ? `<h2>Lampiran Foto Bukti Struk</h2><div class="gallery">${galleryHtml}</div>`
      : ""
  }
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  triggerDownloadBlob(blob, `LPJ-${narrative.fileSlug}-${narrative.todayIso}.html`);
}

export function exportProjectToTxt(project: Project, receipts: Receipt[]): void {
  const narrative = computeLpjNarrative(project, receipts);
  const lines: string[] = [
    "LAPORAN PERTANGGUNGJAWABAN KEUANGAN (LPJ)",
    narrative.safeTitle,
    `Tanggal Penyusunan: ${narrative.printDateLabel}`,
    "============================================================",
    "",
    "I. URAIAN PERTANGGUNGJAWABAN DANA",
    narrative.openingParagraph,
    "",
    narrative.financialParagraph,
    "",
    narrative.categoryParagraph,
    "",
    "II. RINGKASAN DANA",
    `- Dana Awal / Pemasukan : ${narrative.initialBudgetDisplay}`,
    `- Total Pengeluaran     : ${formatRupiah(narrative.totalSpent)}`,
    `- Sisa / Selisih Dana   : ${narrative.remainingBalanceDisplay}`,
    `- Jumlah Bukti Nota     : ${receipts.length} nota (${narrative.verifiedCount} sudah dicek)`,
    "",
    "III. DAFTAR PENGELUARAN PER NOTA",
  ];

  receipts.forEach((r, idx) => {
    lines.push(
      `${idx + 1}. [#${r.referenceNumber}] ${formatShortDateId(
        r.transactionDate
      )} | ${r.merchantName} (${r.category}) = ${formatRupiah(r.totalAmount)}`
    );
  });

  lines.push("");
  lines.push("IV. PENUTUP & PENGESAHAN");
  lines.push(narrative.closingParagraph);
  lines.push("");
  lines.push(`Ketua Pelaksana / Penanggung Jawab : ${narrative.chairpersonLabel}`);
  lines.push(`Bendahara / Penyusun Laporan       : ${narrative.treasurerLabel}`);

  const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8;" });
  triggerDownloadBlob(blob, `LPJ-${narrative.fileSlug}-${narrative.todayIso}.txt`);
}
