export function createManualNoteDataUrl(refLabel: string, dateText: string): string {
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = 560;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#FAF5E8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#8C8577";
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  ctx.fillStyle = "#164231";
  ctx.fillRect(18, 18, canvas.width - 36, 96);

  ctx.fillStyle = "#FDFBF7";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("KUITANSI CATATAN MANUAL", 42, 62);
  ctx.font = "17px monospace";
  ctx.fillText(`No: #${refLabel}   |   Tanggal: ${dateText}`, 42, 92);

  ctx.strokeStyle = "#C8C0B0";
  ctx.lineWidth = 1.5;
  for (let y = 180; y <= 620; y += 52) {
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(canvas.width - 42, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#434B46";
  ctx.font = "19px sans-serif";
  ctx.fillText("Pengeluaran dicatat tanpa lampiran foto kamera.", 42, 220);
  ctx.fillText("Rincian barang dan nominal mengikuti data pada tabel.", 42, 272);

  return canvas.toDataURL("image/png");
}
