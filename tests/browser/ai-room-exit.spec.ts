import { test } from '@playwright/test';
import { createApplication } from '../../src/server/index.js';
import { aiExitScenario } from '../support/ai-exit-scenario.js';

let application:ReturnType<typeof createApplication>,url:string;
test.beforeAll(async()=>{application=createApplication(':memory:');await new Promise<void>(resolve=>application.http.listen(0,'127.0.0.1',resolve));const address=application.http.address();if(!address||typeof address==='string')throw Error('No Node address');url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>application.close());
for(const mobile of [false,true])test(`AI top exit exposes dismissal, retains refresh identity and closes permanently on Node ${mobile?'mobile layout':'desktop'}`,async({browser},testInfo)=>{
  test.setTimeout(90_000);await aiExitScenario(browser,url,'node',mobile,testInfo);
});
