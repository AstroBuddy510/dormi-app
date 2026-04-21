import fs from 'fs';
import path from 'path';

const routesDir = 'artifacts/api-server/src/routes';
const files = fs.readdirSync(routesDir);

files.forEach(file => {
  if (file.endsWith('.ts')) {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace workspace aliases with CORRECT relative paths (4 levels up)
    content = content.replace(/from "..\/..\/..\/lib\/api-zod\/src\/index.js"/g, 'from "../../../../lib/api-zod/src/index.js"');
    content = content.replace(/from "..\/..\/..\/lib\/db\/src\/index.js"/g, 'from "../../../../lib/db/src/index.js"');
    content = content.replace(/from "..\/..\/..\/lib\/db\/src\/schema\/index.js"/g, 'from "../../../../lib/db/src/schema/index.js"');
    
    // Also handle case where they might still be aliases
    content = content.replace(/from "@workspace\/api-zod"/g, 'from "../../../../lib/api-zod/src/index.js"');
    content = content.replace(/from "@workspace\/db"/g, 'from "../../../../lib/db/src/index.js"');
    content = content.replace(/from "@workspace\/db\/schema"/g, 'from "../../../../lib/db/src/schema/index.js"');
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});

// Also fix middlewares (3 levels up from artifacts/api-server/src/middlewares)
const middlewareFile = 'artifacts/api-server/src/middlewares/auth.ts';
if (fs.existsSync(middlewareFile)) {
    let content = fs.readFileSync(middlewareFile, 'utf8');
    content = content.replace(/from "..\/..\/..\/lib\/db\/src\/index.js"/g, 'from "../../../../lib/db/src/index.js"');
    content = content.replace(/from "..\/..\/..\/lib\/db\/src\/schema\/index.js"/g, 'from "../../../../lib/db/src/schema/index.js"');
    
    content = content.replace(/from "@workspace\/db"/g, 'from "../../../../lib/db/src/index.js"');
    content = content.replace(/from "@workspace\/db\/schema"/g, 'from "../../../../lib/db/src/schema/index.js"');
    
    fs.writeFileSync(middlewareFile, content);
    console.log('Updated middlewares/auth.ts');
}
