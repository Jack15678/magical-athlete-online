import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:180000,expect:{timeout:10000},workers:1,retries:0,reporter:[['list'],['html',{open:'never'}]],use:{headless:true,channel:process.platform==='win32'?'msedge':undefined,trace:'retain-on-failure',screenshot:'only-on-failure'}});
