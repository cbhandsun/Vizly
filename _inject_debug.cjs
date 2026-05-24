const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'src/core/services/EdgeRoutingCoordinator.ts');
let c = fs.readFileSync(f, 'utf8');

// Remove all temp debug lines
const lines = c.split('\n');
const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.includes('[DEBUG-TEMP]')) return false;
    if (trimmed.includes('[TRUNK-DBG]')) return false;
    if (trimmed.includes('[TRUNK-CALC]')) return false;
    if (trimmed.includes('[TRUNK-EDGE]')) return false;
    return true;
});
c = filtered.join('\n');
fs.writeFileSync(f, c);
console.log('OK: removed', lines.length - filtered.length, 'debug lines');
