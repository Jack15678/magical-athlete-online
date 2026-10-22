import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {createApplication} from '../../src/server/index.js';
import {createGame,resolveTasks,systemAction} from '../../src/engine/index.js';
import type {GameAction,GameState,Identity,Room} from '../../src/shared/types.js';

let app:ReturnType<typeof createApplication>,url:string;
test.beforeAll(async()=>{app=createApplication(':memory:');await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));const address=app.http.address();if(!address||typeof address==='string')throw Error('Missing address');url=`http://127.0.0.1:${address.port}`;mkdirSync('docs/qa/athlete-feedback',{recursive:true});});
test.afterAll(async()=>{await app.close();});
async function open(browser:Browser,identity:Identity,mobile=false){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
  await context.addInitScript(({identity})=>{localStorage.setItem(`magical-athlete:identity:${identity.roomCode}`,JSON.stringify(identity));localStorage.setItem('magical-athlete:animation-speed','1');localStorage.setItem('magical-athlete:low-quality','true');localStorage.setItem('magical-athlete:reduced-motion','false');localStorage.setItem('magical-athlete:muted','true');},{identity});
  const page=await context.newPage();await page.goto(`${url}/room/${identity.roomCode}`);await expect(page.getByTestId('board-3d')).toBeVisible();return{context,page};
}
async function fixture(browser:Browser,ids:string[],positions:number[],faces:number[],mobile=false,configure?:(game:GameState)=>void){
  const created=app.rooms.create('掷骰者',3,0,'multiplayer',0,'mixed'),code=created.identity.roomCode;
  const joined=app.rooms.join(code,'观察者'),third=app.rooms.join(code,'第三名'),watcher=app.rooms.join(code,'观战者','spectator');
  const room=structuredClone(app.rooms.get(code)),game=createGame(room.game.players,732,'multiplayer','mixed');game.phase='race';game.round=1;
  game.racers=ids.map((characterId,index)=>({id:`r${index}`,identityPlayerId:game.players[index]!.id,playerId:game.players[index]!.id,characterId,position:positions[index]!,tripped:false,finished:false,eliminated:false,flags:{}}));game.baseTurnOrder=game.racers.map(racer=>racer.id);game.currentRacerId='r0';game.flags.testDice=[...faces];game.queue=[{kind:'beginTurn',racerId:'r0'}];resolveTasks(game);
  configure?.(game);room.game=game;room.updatedAt=Date.now()+60_000;room.version++;app.rooms.rooms.set(code,room);app.store.save(room);
  const actor=await open(browser,created.identity,mobile),other=await open(browser,joined.identity,mobile),spectator=await open(browser,watcher.identity,mobile);
  return{code,actor,other,spectator,contexts:[actor.context,other.context,spectator.context]};
}
function publish(code:string){const room=app.rooms.get(code);for(const socket of app.io.sockets.sockets.values())if(socket.data.identity?.roomCode===code)socket.emit('snapshot',app.rooms.view(room,socket.data.identity.playerId));}
function perform(code:string,action?:GameAction){const room=app.rooms.get(code),game=room.game,pending=game.pending,playerId=pending?.playerId??game.racers.find(racer=>racer.id===game.currentRacerId)!.playerId;
  const selected=action??(pending?{type:'choose',choiceId:pending.id,optionId:pending.options.some(option=>option.id==='roll')?'roll':'use'}:{type:'roll'});
  const result=app.rooms.act(code,playerId,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:selected as GameAction});expect(result.ok,result.error).toBe(true);publish(code);
}
async function dispose(contexts:BrowserContext[]){await Promise.all(contexts.map(context=>context.close()));}

test('six public dice are visible to the actor, another player and a spectator, then remain available during selection',async({browser})=>{
  const f=await fixture(browser,['mr-dice-guy','coach','alchemist'],[4,10,15],[2,2,4,5,6,1],true);try{
    perform(f.code);
    for(const {page} of [f.actor,f.other,f.spectator]){const dice=page.locator('.dice-spotlight[data-dice-mode="multi"]');await expect(dice).toBeVisible();await expect(dice).toHaveAttribute('data-up-faces','2,2,4,5,6,1');await expect(page.getByTestId('multi-dice-value').locator('b')).toHaveCount(6);}
    await f.other.page.screenshot({path:'docs/qa/athlete-feedback/six-dice-other-mobile.png'});
    await expect(f.other.page.getByTestId('public-six-dice')).toBeVisible();await expect(f.spectator.page.getByTestId('public-six-dice')).toHaveText(/骰子先生.*2.*2.*4.*5.*6.*1/s);
    await expect(f.actor.page.getByTestId('skill-choice')).toBeVisible();expect(app.rooms.get(f.code).game.pending?.kind).toBe('mr-dice-pick');
  }finally{await dispose(f.contexts);}
});

test('Nemesis shows its own confirmed ability die and the camera stays with its actor between turns',async({browser})=>{
  const f=await fixture(browser,['coach','nemesis','alchemist'],[4,2,16],[3,3]);try{
    perform(f.code);expect(app.rooms.get(f.code).game.pending?.kind).toBe('nemesis');perform(f.code);
    const board=f.spectator.page.getByTestId('board-3d');
    await expect(f.spectator.page.locator('.dice-spotlight[aria-label="宿敌正在掷跟掷骰"]')).toBeVisible({timeout:20000});
    await expect(f.spectator.page.getByTestId('dice-value')).toHaveText(/3.*即将结算能力/s);
    await expect(board).toHaveAttribute('data-camera-target-ids','r1');await f.spectator.page.screenshot({path:'docs/qa/athlete-feedback/nemesis-die-desktop.png'});
    await expect(board).toHaveAttribute('data-phase','idle',{timeout:25000});
    const target=await board.getAttribute('data-camera-target-ids');await f.spectator.page.waitForTimeout(1200);await expect(board).toHaveAttribute('data-camera-target-ids',target!);
  }finally{await dispose(f.contexts);}
});

test('The Hose waits for its second die and shows it before the trip animation',async({browser})=>{
  const f=await fixture(browser,['the-hose','coach','alchemist'],[4,9,18],[2,3]);try{
    perform(f.code);expect(app.rooms.get(f.code).game.pending?.kind).toBe('the-hose-roll');
    await expect(f.actor.page.getByTestId('skill-choice')).toBeVisible({timeout:20000});await expect(f.actor.page.getByRole('button',{name:'掷水管范围骰',exact:true})).toBeVisible();
    expect(app.rooms.get(f.code).game.racers[1]!.tripped).toBe(false);perform(f.code);
    expect(app.rooms.get(f.code).game.logs.some(event=>event.type==='trip'&&event.targets?.includes('r1'))).toBe(true);
    await expect(f.other.page.locator('.dice-spotlight[aria-label="水管正在掷回合结束 · 水管范围骰"]')).toBeVisible({timeout:20000});await expect(f.other.page.getByTestId('dice-value')).toHaveText(/3.*即将结算能力/s);
    await expect(f.other.page.getByTestId('board-3d')).toHaveAttribute('data-phase','trip',{timeout:20000});await f.other.page.screenshot({path:'docs/qa/athlete-feedback/hose-trip-desktop.png'});
    // The server may already begin the victim's recovery turn while this client
    // is still showing the earlier trip; the ordered event stream keeps both.
    const events=app.rooms.get(f.code).game.logs,trip=events.find(event=>event.type==='trip'&&event.targets?.includes('r1'))!;
    const recovery=events.find(event=>event.type==='recover'&&event.source==='r1');if(recovery)expect(recovery.id).toBeGreaterThan(trip.id);
  }finally{await dispose(f.contexts);}
});

test('between actions the camera holds the last actor instead of returning home, then changes for the next die',async({browser})=>{
  const f=await fixture(browser,['coach','alchemist','stepdad'],[4,12,20],[2,3]);try{
    perform(f.code);const board=f.spectator.page.getByTestId('board-3d');
    await expect(board).toHaveAttribute('data-phase','dice');await expect(board).toHaveAttribute('data-phase','idle',{timeout:20000});
    await expect.poll(()=>app.rooms.get(f.code).game.currentRacerId).toBe('r1');await expect(board).toHaveAttribute('data-camera-target-ids','r0');
    await f.spectator.page.waitForTimeout(1300);await expect(board).toHaveAttribute('data-camera-target-ids','r0');
    perform(f.code);await expect(board).toHaveAttribute('data-phase','dice');await expect(board).toHaveAttribute('data-camera-target-ids','r1');
  }finally{await dispose(f.contexts);}
});

test('six distinct faces stay public and wait for the controller to reroll the full batch after refresh',async({browser})=>{
  const f=await fixture(browser,['mr-dice-guy','coach','alchemist'],[4,10,15],[1,2,3,4,5,6,2,2,3,3,4,4]);try{
    perform(f.code);expect(app.rooms.get(f.code).game.pending?.kind).toBe('mr-dice-reroll');
    await expect(f.other.page.locator('.dice-spotlight[data-dice-mode="multi"]')).toHaveAttribute('data-up-faces','1,2,3,4,5,6');
    await expect(f.other.page.getByTestId('public-six-dice')).toHaveText(/六骰均不同.*等待重掷/s);
    expect(app.rooms.get(f.code).game.randomLog).toHaveLength(6);await f.actor.page.reload();await expect(f.actor.page.getByTestId('skill-choice')).toBeVisible();
    expect(app.rooms.get(f.code).game.randomLog).toHaveLength(6);await f.actor.page.getByRole('button',{name:'六骰均不同，重掷六骰',exact:true}).click();
    await expect(f.other.page.locator('.dice-spotlight[data-dice-mode="multi"]')).toHaveAttribute('data-up-faces','2,2,3,3,4,4');
    expect(app.rooms.get(f.code).game.randomLog).toHaveLength(12);expect(app.rooms.get(f.code).game.pending?.kind).toBe('mr-dice-pick');
    await f.other.page.screenshot({path:'docs/qa/athlete-feedback/six-distinct-reroll.png'});
  }finally{await dispose(f.contexts);}
});

test('an unavoidable forced cycle shows its project draw decision and preserves points before the next race',async({browser})=>{
  const f=await fixture(browser,['hopfrog','critic','diva'],[5,30,26],[],false,game=>{
    game.track='wild';game.currentRacerId='r2';game.turn=2;game.turnCount=8;game.racers.forEach(racer=>racer.flags={turnsTaken:2});
    game.racers[1]!.finished=true;game.racers[1]!.rank=1;game.players[1]!.score=3;game.queue=[];
    game.flags={needsBegin:true,placements:[{racerId:'r1',playerId:game.players[1]!.id,characterId:'critic',rank:1,points:3}],nextOverride:[]};
  });try{
    await f.spectator.page.evaluate(()=>{localStorage.setItem('magical-athlete:animation-speed','4');localStorage.setItem('magical-athlete:reduced-motion','true');});await f.spectator.page.reload();await expect(f.spectator.page.getByTestId('board-3d')).toBeVisible();
    for(let index=0;index<40;index++){
      const room=app.rooms.get(f.code),game=room.game;if(game.phase!=='race')break;
      const pending=game.pending,automatic=systemAction(game),actor=automatic?.playerId??pending!.playerId;
      const action=automatic?.action??{type:'choose',choiceId:pending!.id,optionId:pending!.options[0]!.id} as GameAction;
      const reply=app.rooms.act(f.code,actor,{actionId:crypto.randomUUID(),expectedVersion:room.version,action});expect(reply.ok,reply.error).toBe(true);
    }
    const result=app.rooms.get(f.code);expect(result.game.phase).toBe('results');expect(result.game.results.at(-1)?.drawReason).toBe('forced-cycle');expect(result.game.players.map(player=>player.score)).toEqual([0,3,0]);publish(f.code);
    await expect(f.spectator.page.getByTestId('skill-banner')).toContainText('强制循环 · 本场和局',{timeout:30000});
    await expect(f.spectator.page.locator('.round-draw-notice')).toContainText('未完赛选手不追加名次分',{timeout:30000});await f.spectator.page.screenshot({path:'docs/qa/athlete-feedback/forced-cycle-draw.png'});
    const room=app.rooms.get(f.code),reply=app.rooms.act(f.code,room.hostId,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'next'}});expect(reply.ok).toBe(true);expect(app.rooms.get(f.code).game.round).toBe(2);
  }finally{await dispose(f.contexts);}
});
