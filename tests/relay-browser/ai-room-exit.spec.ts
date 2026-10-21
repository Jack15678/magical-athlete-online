import { test } from '@playwright/test';
import { aiExitScenario } from '../support/ai-exit-scenario.js';

const url=process.env.RELAY_URL??'http://127.0.0.1:8787';
for(const mobile of [false,true])test(`AI top exit exposes dismissal, retains refresh identity and closes permanently on relay ${mobile?'mobile layout':'desktop'}`,async({browser},testInfo)=>{
  test.setTimeout(90_000);await aiExitScenario(browser,url,'relay',mobile,testInfo);
});
