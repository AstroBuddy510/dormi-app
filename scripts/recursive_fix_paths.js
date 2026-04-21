import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach( f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
};

const targetDirs = [
    'artifacts/api-server/src',
    'lib/db/src',
    'lib/api-zod/src'
];

targetDirs.forEach(root => {
    if (!fs.existsSync(root)) return;
    
    walk(root, (filePath) => {
        if (!filePath.endsWith('.ts')) return;
        
        let content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        const updatedLines = lines.map(line => {
            // Regex to match: from './path' or from "../path" or from "../../path" etc.
            // and ensure it doesn't already have .js
            // This version handles any number of dots (./, ../, ../../, etc.)
            
            // Single quotes
            if (line.includes("from './") || line.includes("from '../")) {
                if (!line.includes(".js'")) {
                    return line.replace(/from '(\.\.?\/[^']+)'/g, "from '$1.js'");
                }
            }
            // Double quotes
            if (line.includes('from "./') || line.includes('from "../')) {
                if (!line.includes('.js"')) {
                    return line.replace(/from "(\.\.?\/[^"]+)"/g, 'from "$1.js"');
                }
            }
            return line;
        });
        
        const updatedContent = updatedLines.join('\n');
        if (content !== updatedContent) {
            fs.writeFileSync(filePath, updatedContent);
            console.log(`Updated ${filePath}`);
        }
    });
});
