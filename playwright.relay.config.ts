import { defineConfig } from '@playwright/test';
const ci = !!process.env.CI;
export default defineConfig({
  testDir:'./tests/relay-browser',timeout:process.env.RELAY_URL?600000:ci?360000:240000,expect:{timeout:ci?20000:15000},workers:1,retries:0,
  reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report-relay'}]],
  use:{baseURL:process.env.RELAY_URL??'http://127.0.0.1:8787',headless:true,channel:process.platform==='win32'?'msedge':undefined,deviceScaleFactor:1,actionTimeout:ci?20000:0,trace:ci?'off':'retain-on-failure',screenshot:'only-on-failure',launchOptions:ci?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--max-active-webgl-contexts=32']}:undefined},
  webServer:process.env.RELAY_URL?undefined:{command:'node node_modules/wrangler/bin/wrangler.js dev --ip 127.0.0.1 --port 8787',url:'http://127.0.0.1:8787/api/browser/health',reuseExistingServer:!process.env.CI,timeout:60000},
});
