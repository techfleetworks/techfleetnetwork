import { jsPDF } from "jspdf";

/**
 * Loads the Lato font into the canvas context by preloading via FontFace API.
 * Falls back to sans-serif if loading fails.
 */
async function loadLato(): Promise<string> {
  const fontFamily = "Lato";
  try {
    // Use Google Fonts CSS to load Lato Bold + Regular
    const bold = new FontFace(fontFamily, "url(https://fonts.gstatic.com/s/lato/v24/S6u9w4BMUTPHh7USSwiPGQ3q5d0.woff2)", { weight: "700" });
    const regular = new FontFace(fontFamily, "url(https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXiWtFCc.woff2)", { weight: "400" });
    const [boldFont, regularFont] = await Promise.all([bold.load(), regular.load()]);
    document.fonts.add(boldFont);
    document.fonts.add(regularFont);
    return fontFamily;
  } catch {
    console.warn("Failed to load Lato font, falling back to sans-serif");
    return "Arial, Helvetica, sans-serif";
  }
}

/**
 * Generates a PDF certificate by rendering the SVG template
 * and overlaying the class name and recipient name.
 *
 * Layout (top to bottom, centered):
 *   1. Class name — large, bold Lato
 *   2. Gap
 *   3. Person's name — medium, regular Lato
 */
export async function generateCertificatePdf(fullName: string, className?: string): Promise<void> {
  const svgWidth = 1728;
  const svgHeight = 1117;

  const pdfWidthMm = 297;
  const pdfHeightMm = Math.round((svgHeight / svgWidth) * pdfWidthMm);

  // Load Lato font in parallel with the SVG fetch
  const [svgRes, fontFamily] = await Promise.all([
    fetch("/certificates/masterclass-template.svg"),
    loadLato(),
  ]);

  if (!svgRes.ok) throw new Error("Failed to load certificate template");
  const svgText = await svgRes.text();

  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.width = svgWidth;
  img.height = svgHeight;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to render SVG template"));
    img.src = svgUrl;
  });

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = svgWidth * scale;
  canvas.height = svgHeight * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, svgWidth, svgHeight);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const centerX = svgWidth / 2;

  // Use the same font size formula for both class name and person's name
  const sharedFontSize = Math.max(44, Math.min(64, 2200 / Math.max(fullName.length, (className ?? "").length)));

  if (className) {
    // Total block height: two lines of text + gap between them
    const gap = 40;
    const blockHeight = sharedFontSize * 2 + gap;
    // Center the block vertically on the canvas
    const blockTop = (svgHeight - blockHeight) / 2;

    // --- Class name: bold, top of centered block ---
    ctx.font = `bold ${sharedFontSize}px "${fontFamily}", sans-serif`;
    ctx.fillStyle = "#1a1a1a";
    const classY = blockTop + sharedFontSize / 2;
    ctx.fillText(className, centerX, classY);

    // --- Person's name: regular weight, below class name ---
    ctx.font = `400 ${sharedFontSize}px "${fontFamily}", sans-serif`;
    ctx.fillStyle = "#3f3f46";
    const nameY = classY + sharedFontSize + gap;
    ctx.fillText(fullName, centerX, nameY);
  } else {
    // No class name — person's name dead center
    ctx.font = `bold ${sharedFontSize}px "${fontFamily}", sans-serif`;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(fullName, centerX, svgHeight / 2);
  }

  URL.revokeObjectURL(svgUrl);

  const imgDataUrl = canvas.toDataURL("image/jpeg", 0.95);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [pdfWidthMm, pdfHeightMm],
  });

  pdf.addImage(imgDataUrl, "JPEG", 0, 0, pdfWidthMm, pdfHeightMm);
  pdf.save(`Certificate-${fullName.replace(/\s+/g, "_")}.pdf`);
}
