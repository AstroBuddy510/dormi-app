import fs from 'fs';
import path from 'path';

const schemaDir = 'lib/db/src/schema';
const files = fs.readdirSync(schemaDir);

files.forEach(file => {
  if (file.endsWith('.ts')) {
    const filePath = path.join(schemaDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace internal relative imports with .js extensions
    // Look for: from "./filename" or from "../filename"
    // But exclude packages (which don't start with .)
    
    const lines = content.split('\n');
    const updatedLines = lines.map(line => {
        if (line.includes('from "./') && !line.includes('.js"')) {
            return line.replace(/from "(\.\/[^"]+)"/g, 'from "$1.js"');
        }
        if (line.includes('from "../') && !line.includes('.js"')) {
            return line.replace(/from "(\.\.\/[^"]+)"/g, 'from "$1.js"');
        }
        return line;
    });
    
    const updatedContent = updatedLines.join('\n');
    if (content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent);
        console.log(`Updated ${file}`);
    }
  }
});
