import { jsPDF } from "jspdf";

/**
 * Generates a PDF certificate by rendering the SVG template
 * and overlaying the recipient's full name in the center.
 */
export async function generateCertificatePdf(fullName: string, className?: string): Promise<void> {
  // SVG dimensions
  const svgWidth = 1728;
  const svgHeight = 1117;

  // Landscape PDF matching SVG aspect ratio (in mm)
  const pdfWidthMm = 297; // A4 landscape width
  const pdfHeightMm = Math.round((svgHeight / svgWidth) * pdfWidthMm);

  // Fetch the SVG template
  const svgRes = await fetch("/certificates/masterclass-template.svg");
  if (!svgRes.ok) throw new Error("Failed to load certificate template");
  const svgText = await svgRes.text();

  // Create an image from the SVG
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

  // Render SVG to canvas at high resolution
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = svgWidth * scale;
  canvas.height = svgHeight * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, svgWidth, svgHeight);

  // Draw the recipient name centered
  const nameFontSize = Math.max(48, Math.min(72, 1200 / fullName.length));
  ctx.font = `bold ${nameFontSize}px "Georgia", "Times New Roman", serif`;
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const nameClassGap = 40;
  const centerY = className ? svgHeight / 2 - 40 : svgHeight / 2;
  ctx.fillText(fullName, svgWidth / 2, centerY);

  // Draw the class name below the recipient name with generous spacing
  if (className) {
    const classFontSize = Math.max(28, Math.min(40, 1000 / className.length));
    ctx.font = `italic ${classFontSize}px "Georgia", "Times New Roman", serif`;
    ctx.fillStyle = "#3f3f46";
    ctx.fillText(className, svgWidth / 2, centerY + nameFontSize + nameClassGap);
  }

  URL.revokeObjectURL(svgUrl);

  // Convert canvas to image data URL
  const imgDataUrl = canvas.toDataURL("image/jpeg", 0.95);

  // Create PDF
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [pdfWidthMm, pdfHeightMm],
  });

  pdf.addImage(imgDataUrl, "JPEG", 0, 0, pdfWidthMm, pdfHeightMm);
  pdf.save(`Certificate-${fullName.replace(/\s+/g, "_")}.pdf`);
}
