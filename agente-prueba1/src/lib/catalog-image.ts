import sharp from "sharp";
import { parse, type Font, type Path } from "opentype.js";
import { FONT_BASE64 } from "./fonts/font-data";

type CatalogOption = { number: number; imageUrl: string; label: string };
const tileWidth = 540, tileHeight = 660, gap = 18;

let cachedFont: Font | null = null;
function getFont(): Font {
  if (cachedFont) return cachedFont;
  const buf = Buffer.from(FONT_BASE64, "base64");
  cachedFont = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return cachedFont;
}

function pathToSvg(path: Path, fill = "#ffffff", stroke?: string, strokeWidth = 0): string {
  let d = "";
  for (const cmd of path.commands) {
    if (cmd.type === "M") {
      d += `M${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)}`;
    } else if (cmd.type === "L") {
      d += `L${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)}`;
    } else if (cmd.type === "Q") {
      d += `Q${cmd.x1.toFixed(2)} ${cmd.y1.toFixed(2)} ${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)}`;
    } else if (cmd.type === "C") {
      d += `C${cmd.x1.toFixed(2)} ${cmd.y1.toFixed(2)} ${cmd.x2.toFixed(2)} ${cmd.y2.toFixed(2)} ${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)}`;
    } else if (cmd.type === "Z") {
      d += "Z";
    }
  }
  const strokeAttr = stroke && strokeWidth ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : "";
  return `<path d="${d}" fill="${fill}"${strokeAttr}/>`;
}

function fitText(font: Font, text: string, maxWidth: number, fontSize: number): string {
  if (font.getAdvanceWidth(text, fontSize) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && font.getAdvanceWidth(truncated + "...", fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.trim() + "...";
}

function overlay(number: number, label: string): Buffer {
  try {
    const font = getFont();
    const numStr = String(number);
    const numWidth = font.getAdvanceWidth(numStr, 32);
    const numX = 50 - numWidth / 2;
    const numPath = font.getPath(numStr, numX, 62, 32);
    const numSvg = pathToSvg(numPath, "#ffffff", "#ffffff", 0.5);

    const truncated = fitText(font, label, 490, 25);
    const labelPath = font.getPath(truncated, 22, 624, 25);
    const labelSvg = pathToSvg(labelPath, "#ffffff");

    return Buffer.from(`<svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="18" width="64" height="64" rx="32" fill="#0f172a" />
      ${numSvg}
      <rect x="0" y="570" width="${tileWidth}" height="90" fill="#0f172a" fill-opacity="0.92" />
      ${labelSvg}
    </svg>`);
  } catch (error) {
    console.error("[catalog-image] Error vectorizando texto con fuente:", error);
    const escapeSvg = (val: string) => val.replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&apos;","\"":"&quot;"}[c]!));
    const text = escapeSvg(label.length > 46 ? `${label.slice(0, 43)}...` : label);
    return Buffer.from(`<svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="18" width="64" height="64" rx="32" fill="#0f172a" />
      <text x="50" y="61" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="white">${number}</text>
      <rect x="0" y="570" width="${tileWidth}" height="90" fill="#0f172a" fill-opacity="0.92" />
      <text x="22" y="607" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="white">${text}</text>
    </svg>`);
  }
}

async function makeTile(option: CatalogOption) {
  const response = await fetch(option.imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`No se pudo descargar una imagen del catálogo (${response.status}).`);
  const imgBuffer = Buffer.from(await response.arrayBuffer());

  return sharp(imgBuffer)
    .rotate()
    .resize(tileWidth, tileHeight, { fit: "cover", position: "centre" })
    .composite([{ input: overlay(option.number, option.label), top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function createCatalogImage(options: CatalogOption[]) {
  if (!options.length) throw new Error("No hay imágenes disponibles para el catálogo.");
  const columns = options.length === 1 ? 1 : 2;
  const rows = Math.ceil(options.length / columns);
  const tiles = await Promise.all(options.map(makeTile));
  return sharp({
    create: {
      width: columns * tileWidth + (columns + 1) * gap,
      height: rows * tileHeight + (rows + 1) * gap,
      channels: 3,
      background: "#f3f4f6"
    }
  })
    .composite(
      tiles.map((input, index) => ({
        input,
        left: gap + (index % columns) * (tileWidth + gap),
        top: gap + Math.floor(index / columns) * (tileHeight + gap)
      }))
    )
    .jpeg({ quality: 88 })
    .toBuffer();
}
