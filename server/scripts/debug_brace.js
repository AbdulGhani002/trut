const fs = require('fs');
const path = 'server/src/index.ts';
const s = fs.readFileSync(path, 'utf8');
function pos(i) { const lines = s.slice(0, i).split(/\r?\n/); return { line: lines.length, col: lines[lines.length - 1].length + 1 }; }
const open = '({['; const close = ')}]';
let stack = [];
for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (open.includes(c)) stack.push({ c, i });
    else if (close.includes(c)) {
        const expected = open[close.indexOf(c)];
        const last = stack.pop();
        if (!last || last.c !== expected) {
            console.log('Mismatch at index', i, 'char', c, 'expected', expected, 'last', last ? { c: last.c, idx: last.i, pos: pos(last.i) } : null, 'pos', pos(i));
            const start = Math.max(0, i - 400);
            const end = Math.min(s.length, i + 200);
            console.log('\n--- context ---\n');
            console.log(s.slice(start, end));
            process.exit(1);
        }
    }
}
if (stack.length) {
    const last = stack[stack.length - 1];
    console.log('Unclosed at end', { c: last.c, idx: last.i, pos: pos(last.i) });
    const start = Math.max(0, last.i - 200);
    console.log('\n--- tail context ---\n');
    console.log(s.slice(start, last.i + 200));
    process.exit(2);
}
console.log('All balanced');
