const fs = require('fs');

function findDuplicateKeys(jsonString) {
    const duplicates = [];
    const keysStack = [new Set()];
    
    // This is a very simple parser to find duplicates in a JSON-like string
    // It doesn't handle all cases but should work for this file
    const lines = jsonString.split('\n');
    const pathStack = [];
    
    lines.forEach((line, index) => {
        const match = line.match(/"([^"]+)"\s*:/);
        if (match) {
            const key = match[1];
            const currentLevel = (line.match(/^\s*/)[0].length / 4); // Assuming 4 spaces
            
            while (pathStack.length > currentLevel) {
                pathStack.pop();
            }
            
            const currentPath = pathStack.join('.') + (pathStack.length > 0 ? '.' : '') + key;
            
            if (line.includes('{')) {
                pathStack.push(key);
            }
            
            // Just a simple check for this specific file structure
        }
    });
    
    // Let's try another approach: parse manually
    const keys = {};
    const regex = /"([^"]+)"\s*:/g;
    let m;
    while ((m = regex.exec(jsonString)) !== null) {
        const key = m[1];
        // This is still not perfect because of nesting
    }
}

// Actually, the easiest way is to use a library or just the IDE warning.
// Since the IDE already gave me the line numbers, I'll just fix them.
