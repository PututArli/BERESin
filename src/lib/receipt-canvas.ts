// Renders honest, explicitly stamped [DATA SIMULASI] sample receipt images as PNG data URLs on HTMLCanvasElement
// so users can test Zoom, Rotate 90deg, Pan, and PDF A4 photo grid export without uploading personal receipts first.

export interface SimulatedReceiptTemplate {
  kind: "thermal" | "warung" | "qris";
  refLabel: string;
  title: string;
  subtitle: string;
  dateText: string;
  lines: Array<{ label: string; qty: string; price: string }>;
  footerRows: Array<{ label: string; value: string; bold?: boolean }>;
  handwritingNote?: string;
}

export function renderSimulatedReceiptDataUrl(
  tpl: SimulatedReceiptTemplate
): string {
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 880;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  if (tpl.kind === "warung") {
    ctx.fillStyle = "#FAF3E3";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#B8C7D9";
    ctx.lineWidth = 1;
    for (let y = 170; y < 780; y += 44) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(600, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#D68A82";
    ctx.beginPath();
    ctx.moveTo(110, 130);
    ctx.lineTo(110, 780);
    ctx.stroke();
  } else if (tpl.kind === "qris") {
    ctx.fillStyle = "#F3F7F5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#164231";
    ctx.fillRect(0, 0, canvas.width, 132);
  } else {
    ctx.fillStyle = "#F7F6F2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.strokeStyle = "#8C8577";
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

  // Diagonal [DATA SIMULASI] stamp required by R-23 and R-38 so sample images are never mistaken for real receipts.
  ctx.save();
  ctx.translate(470, 92);
  ctx.rotate(0.14);
  ctx.strokeStyle = "#A82819";
  ctx.lineWidth = 3;
  ctx.strokeRect(-128, -26, 256, 52);
  ctx.fillStyle = "#A82819";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillText("[DATA SIMULASI]", 0, 6);
  ctx.restore();

  if (tpl.kind === "qris") {
    ctx.fillStyle = "#FDFBF7";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(tpl.title, 44, 68);
    ctx.font = "18px sans-serif";
    ctx.fillText(tpl.subtitle, 44, 102);
  } else {
    ctx.fillStyle = "#181B19";
    ctx.font = tpl.kind === "warung" ? "italic bold 28px serif" : "bold 26px monospace";
    ctx.textAlign = "left";
    ctx.fillText(tpl.title, 44, 78);
    ctx.fillStyle = "#434B46";
    ctx.font = "18px monospace";
    ctx.fillText(tpl.subtitle, 44, 112);
  }

  ctx.fillStyle = "#181B19";
  ctx.font = "18px monospace";
  ctx.fillText(`Tgl: ${tpl.dateText}`, 44, 168);
  ctx.fillText(`Ref: ${tpl.refLabel}`, 370, 168);

  ctx.strokeStyle = "#434B46";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(44, 196);
  ctx.lineTo(596, 196);
  ctx.stroke();
  ctx.setLineDash([]);

  let currentY = 244;
  for (const row of tpl.lines) {
    ctx.fillStyle = tpl.kind === "warung" ? "#1E2F5C" : "#181B19";
    ctx.font = tpl.kind === "warung" ? "italic 22px serif" : "20px monospace";
    ctx.textAlign = "left";
    ctx.fillText(row.label, 44, currentY);

    ctx.font = "18px monospace";
    ctx.fillStyle = "#434B46";
    ctx.fillText(row.qty, 44, currentY + 26);

    ctx.textAlign = "right";
    ctx.fillStyle = tpl.kind === "warung" ? "#1E2F5C" : "#181B19";
    ctx.font = tpl.kind === "warung" ? "bold 22px serif" : "bold 20px monospace";
    ctx.fillText(row.price, 596, currentY + 12);
    currentY += 74;
  }

  ctx.strokeStyle = "#434B46";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(44, currentY);
  ctx.lineTo(596, currentY);
  ctx.stroke();
  ctx.setLineDash([]);

  currentY += 46;
  for (const f of tpl.footerRows) {
    ctx.textAlign = "left";
    ctx.font = f.bold ? "bold 23px monospace" : "19px monospace";
    ctx.fillStyle = "#181B19";
    ctx.fillText(f.label, 44, currentY);

    ctx.textAlign = "right";
    ctx.fillText(f.value, 596, currentY);
    currentY += 40;
  }

  if (tpl.handwritingNote) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#78350F";
    ctx.font = "italic 18px serif";
    ctx.fillText(tpl.handwritingNote, 44, 825);
  }

  return canvas.toDataURL("image/png");
}
