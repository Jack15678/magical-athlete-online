import { defineConfig } from '@playwright/test';
const ci = !!process.env.CI;
export default defineConfig({
  testDir:'./tests/browser', timeout:ci?360000:180000, expect:{timeout:ci?20000:10000}, workers:1, retries:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{
    headless:true, channel:process.platform==='win32'?'msedge':undefined, deviceScaleFactor:1,
    // Trace screenshots force ReadPixels on every action across up to sixteen
    // live WebGL canvases. Keep real scene captures and failure screenshots.
    trace:ci?'off':'retain-on-failure', screenshot:'only-on-failure',
    launchOptions:ci?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--max-active-webgl-contexts=32']}:undefined,
  },
});
