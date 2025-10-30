const fs = require('fs');
const s = fs.readFileSync('server/src/index.ts','utf8');
const needle = 'setTimeout(async () => {';
const idx = s.indexOf(needle);
if(idx===-1){console.error('needle not found'); process.exit(1);}
const endIdx = s.indexOf('}, 500);', idx);
console.log('start pos', idx, 'start line', s.slice(0,idx).split(/\r?\n/).length);
console.log('end pos', endIdx, 'end line', s.slice(0,endIdx).split(/\r?\n/).length);
const segment = s.slice(idx, endIdx);
let openCurly=0, closeCurly=0, openParen=0, closeParen=0;
for(const c of segment){ if(c==='{') openCurly++; else if(c==='}') closeCurly++; else if(c==='(') openParen++; else if(c===')') closeParen++; }
console.log('counts in segment (not including end): openCurly',openCurly,'closeCurly',closeCurly,'openParen',openParen,'closeParen',closeParen);
console.log('\n--- segment start ---\n');
console.log(segment);
console.log('\n--- segment end ---\n');
