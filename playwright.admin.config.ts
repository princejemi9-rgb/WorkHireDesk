import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig(base,{
 testIgnore:[],testMatch:'admin-product.spec.ts',workers:1,
 use:{baseURL:'http://localhost:4320'},
 webServer:[
 {command:'node scripts/test-admin-backend.mjs',url:'http://127.0.0.1:4319/health',reuseExistingServer:true},
 {command:'node node_modules/next/dist/bin/next dev --port 4320',url:'http://localhost:4320/apply',reuseExistingServer:false,timeout:300000,env:{NEXT_BUILD_DIR:'.next-admin-test',APP_ORIGIN:'http://localhost:4320',SUPABASE_URL:'http://127.0.0.1:4319',SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-service-key-with-no-real-access',SSN_ENCRYPTION_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SSN_ENCRYPTION_KEY_ID:'test-v1',ADMIN_SESSION_KEY_BASE64:Buffer.alloc(32,9).toString('base64'),RATE_LIMIT_HMAC_KEY:'r'.repeat(32),SUBMISSION_HMAC_KEY:'s'.repeat(32)}}
 ]
});
