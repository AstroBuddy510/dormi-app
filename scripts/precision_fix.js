import fs from 'fs';
import path from 'path';

// 1. REVERT extensions in files that are causing BUILD failures (scripts that run during pnpm build)
const buildTimeFiles = [
    'lib/db/src/seed.ts',
    'lib/db/src/migrate.ts'
];

buildTimeFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Remove .js from relative imports
        content = content.replace(/from '(\.\.?\/[^']+)\.js'/g, "from '$1'");
        content = content.replace(/from "(\.\.?\/[^"]+)\.js"/g, 'from "$1"');
        fs.writeFileSync(filePath, content);
        console.log(`Reverted build-time file: ${filePath}`);
    }
});

// 2. ENSURE the runtime files (the ones Vercel actually runs) HAVE the extensions
// We know artifacts/api-server/src/routes/orders.ts was missing gatewayKeys.js
const runtimeFilesToFix = [
    'artifacts/api-server/src/routes/orders.ts'
];

runtimeFilesToFix.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Specifically fix gatewayKeys
        if (content.includes('from "../lib/gatewayKeys"') && !content.includes('.js"')) {
            content = content.replace('from "../lib/gatewayKeys"', 'from "../lib/gatewayKeys.js"');
            fs.writeFileSync(filePath, content);
            console.log(`Fixed runtime file: ${filePath}`);
        }
    }
});
