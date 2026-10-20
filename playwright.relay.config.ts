import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/relay-browser',timeout:240000,expect:{timeout:15000},workers:1,retries:0,
  reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report-relay'}]],
  use:{baseURL:process.env.RELAY_URL??'http://127.0.0.1:8787',headless:true,channel:process.platform==='win32'?'msedge':undefined,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:process.env.RELAY_URL?undefined:{command:'node node_modules/wrangler/bin/wrangler.js dev --ip 127.0.0.1 --port 8787',url:'http://127.0.0.1:8787/api/browser/health',reuseExistingServer:!process.env.CI,timeout:60000},
});
