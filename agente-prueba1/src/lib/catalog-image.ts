import sharp from "sharp";

type CatalogOption = { number:number; imageUrl:string; label:string };
const tileWidth=540, tileHeight=660, gap=18;
const escapeSvg=(value:string)=>value.replace(/[&<>'"]/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&apos;","\"":"&quot;"}[character]!));
function overlay(number:number,label:string) {
  const text=escapeSvg(label.length>46?`${label.slice(0,43)}...`:label);
  return Buffer.from(`<svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="18" width="64" height="64" rx="32" fill="#111827"/><text x="50" y="61" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="white">${number}</text><rect x="0" y="570" width="540" height="90" fill="#111827" fill-opacity="0.88"/><text x="22" y="607" font-family="Arial" font-size="25" font-weight="700" fill="white">${text}</text></svg>`);
}
async function makeTile(option:CatalogOption) {
  const response=await fetch(option.imageUrl); if(!response.ok) throw new Error(`No se pudo descargar una imagen del catálogo (${response.status}).`);
  return sharp(Buffer.from(await response.arrayBuffer())).rotate().resize(tileWidth,tileHeight,{fit:"cover",position:"centre"}).composite([{input:overlay(option.number,option.label),top:0,left:0}]).jpeg({quality:85}).toBuffer();
}
export async function createCatalogImage(options:CatalogOption[]) {
  if(!options.length) throw new Error("No hay imágenes disponibles para el catálogo.");
  const columns=options.length===1?1:2, rows=Math.ceil(options.length/columns);
  const tiles=await Promise.all(options.map(makeTile));
  return sharp({create:{width:columns*tileWidth+(columns+1)*gap,height:rows*tileHeight+(rows+1)*gap,channels:3,background:"#f3f4f6"}}).composite(tiles.map((input,index)=>({input,left:gap+(index%columns)*(tileWidth+gap),top:gap+Math.floor(index/columns)*(tileHeight+gap)}))).jpeg({quality:88}).toBuffer();
}
