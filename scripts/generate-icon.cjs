// PNG determinístico de 512px; dispensa ferramentas nativas na preparação do build.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const size = 512;
const pixels = Buffer.alloc(size * size * 4);
const rectangles = [[8,0,1,2],[8,15,1,2],[0,8,2,1],[15,8,2,1],[7,2,1,3],[9,2,1,3],[7,12,1,3],[9,12,1,3],[2,7,3,1],[12,7,3,1],[2,9,3,1],[12,9,3,1],[4,4,2,1],[11,4,2,1],[4,12,2,1],[11,12,2,1],[4,5,1,1],[12,5,1,1],[4,11,1,1],[12,11,1,1],[6,5,1,1],[10,5,1,1],[6,11,1,1],[10,11,1,1],[5,6,1,1],[11,6,1,1],[5,10,1,1],[11,10,1,1]];
function pixel(x, y, color) { const i = (y * size + x) * 4; pixels.set(color, i); }
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const cornerX = Math.max(104 - x, x - 407, 0), cornerY = Math.max(104 - y, y - 407, 0);
  if (cornerX * cornerX + cornerY * cornerY <= 104 * 104) pixel(x, y, [16,16,28,255]);
}
for (const [x,y,w,h] of rectangles) for (let py = 103+y*18; py < 103+(y+h)*18; py++) for (let px = 103+x*18; px < 103+(x+w)*18; px++) pixel(px, py, [242,201,76,255]);
for (const [x,y,w,h] of [[8,7,1,1],[7,8,3,1],[8,9,1,1]]) for (let py=103+y*18;py<103+(y+h)*18;py++) for (let px=103+x*18;px<103+(x+w)*18;px++) pixel(px,py,[255,244,194,255]);
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,crc]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
const rows = Buffer.alloc((size*4+1)*size);
for (let y=0;y<size;y++) pixels.copy(rows,y*(size*4+1)+1,y*size*4,(y+1)*size*4);
fs.writeFileSync(path.join(__dirname,"../assets/icon.png"),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",zlib.deflateSync(rows)),chunk("IEND",Buffer.alloc(0))]));
console.log("Ícone PNG gerado.");
