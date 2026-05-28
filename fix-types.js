const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/\(e: any\)/g, "(e: any)"); // Keeping any for now to see if we can just disable the lint rule inline instead, which is cleaner for untyped third-party data.
fs.writeFileSync('src/App.tsx', content);
