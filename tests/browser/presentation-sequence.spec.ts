import {mkdirSync,writeFileSync} from 'node:fs';
import {test,expect,type Browser,type Page} from '@playwright/test';
import {createApplication} from '../../src/server/index.js';
import {createGame,resolveTasks} from '../../src/engine/index.js';
import type {Room} from '../../src/shared/types.js';

let application:ReturnType<typeof createApplication>,url:string;
test.beforeAll(async()=>{application=createApplication(':memory:');await new Promise<void>(resolve=>application.http.listen(0,'127.0.0.1',resolve));const address=application.http.address();if(!address||typeof address==='string')throw Error('Missing test address');url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await application.close();});
async function fixture(browser:Browser,ai:boolean,round=1){
  const created=application.rooms.create('动画验收',ai?3:1,0,ai?'ai':'practice',2),code=created.identity.roomCode;
  const room=structuredClone(application.rooms.get(code)),game=createGame(room.game.players,123,ai?'ai':'practice');game.phase='race';game.round=round;if(!ai){game.players[0]!.hand=['legs','alchemist','gunk'];game.players[0]!.used=['coach'];}
  game.racers=(ai?['legs','alchemist','centaur']:['coach']).map((characterId,index)=>({id:`r${index}`,playerId:game.players[index]!.id,characterId,position:ai?[15,5,2][index]!:26,tripped:false,finished:false,eliminated:false,flags:{}}));
  game.currentRacerId=ai?'r2':'r0';game.flags.testDice=[ai?6:3];game.queue.push({kind:'beginTurn',racerId:game.currentRacerId});resolveTasks(game);
  room.game=game;room.updatedAt=Date.now()+60_000;room.version++;application.rooms.rooms.set(code,room);application.store.save(room);
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  await context.addInitScript(({identity})=>{localStorage.setItem(`magical-athlete:identity:${identity.roomCode}`,JSON.stringify(identity));localStorage.setItem('magical-athlete:animation-speed','1');localStorage.setItem('magical-athlete:reduced-motion','false');localStorage.setItem('magical-athlete:low-quality','true');localStorage.setItem('magical-athlete:muted','true');},{identity:created.identity});
  const page=await context.newPage();await page.goto(`${url}/room/${code}`);await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase','idle');
  await expect.poll(async()=>Number(await page.getByTestId('board-3d').getAttribute('data-triangles'))).toBeGreaterThan(100);
  await page.evaluate(()=>{const board=document.querySelector('[data-testid="board-3d"]')!;const scope=window as unknown as {__seenPhases:string[]};scope.__seenPhases=[];new MutationObserver(()=>{const phase=board.getAttribute('data-phase')!;if(scope.__seenPhases.at(-1)!==phase)scope.__seenPhases.push(phase);}).observe(board,{attributes:true,attributeFilter:['data-phase']});});
  return{context,page,code};
}
const phases=(page:Page)=>page.evaluate(()=>(window as unknown as {__seenPhases:string[]}).__seenPhases);

test('AI dice, movement and reactive skill finish in order before my next-turn choice appears',async({browser})=>{
  const session=await fixture(browser,true);try{
    application.rooms.get(session.code).updatedAt=Date.now()-2000;
    const board=session.page.getByTestId('board-3d');await expect(board).toHaveAttribute('data-phase','dice');
    await expect.poll(()=>application.rooms.get(session.code).game.pending?.kind).toBe('legs');
    await expect(board).toHaveAttribute('data-phase','dice');expect(await session.page.getByTestId('skill-choice').count()).toBe(0);
    await expect(board).toHaveAttribute('data-phase','skill',{timeout:15000});
    await expect(session.page.getByTestId('skill-choice')).toBeVisible({timeout:20000});
    const seen=await phases(session.page);expect(seen.indexOf('dice')).toBeLessThan(seen.indexOf('move'));expect(seen.indexOf('move')).toBeLessThan(seen.indexOf('skill'));expect(seen.filter(phase=>phase==='move').length).toBeGreaterThanOrEqual(2);
    expect(application.rooms.get(session.code).game.racers.find(racer=>racer.id==='r2')?.position).toBe(8);
  }finally{await session.context.close();}
});

test('a fast next-round snapshot cannot unmount the current dice or finish animation',async({browser})=>{
  const session=await fixture(browser,false);try{
    await session.page.getByRole('button',{name:'掷骰子',exact:true}).click();const board=session.page.getByTestId('board-3d');await expect(board).toHaveAttribute('data-phase','dice');
    const room=application.rooms.get(session.code);expect(room.game.phase).toBe('results');
    const advanced=application.rooms.act(room.code,room.hostId,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'next'}});expect(advanced.ok).toBe(true);
    const next=application.rooms.get(room.code);for(const socket of application.io.sockets.sockets.values())if(socket.data.identity?.roomCode===room.code)socket.emit('snapshot',application.rooms.view(next,socket.data.identity.playerId));
    await expect(board).toHaveAttribute('data-phase','dice');expect(await session.page.locator('.hand-selection').count()).toBe(0);
    await expect(board).toHaveAttribute('data-phase','finish',{timeout:15000});
    await expect(session.page.locator('.hand-selection')).toBeVisible({timeout:15000});expect(await session.page.getByTestId('board-3d').count()).toBe(0);
    expect(await phases(session.page)).toContain('finish');
  }finally{await session.context.close();}
});


test('a real Node log gap pages the earliest die, power and move before displaying their result',async({browser})=>{
  const session=await fixture(browser,false);try{
    const requests:number[]=[];
    for(const socket of application.io.sockets.sockets.values())if(socket.data.identity?.roomCode===session.code)socket.on('events',(query:{afterId:number})=>requests.push(query.afterId));
    const room=structuredClone(application.rooms.get(session.code)),start=room.game.logs.at(-1)?.id??0;
    room.game.logs.push({id:start+1,type:'die',source:'r0',text:'教练掷出3'},{id:start+2,type:'roll',source:'r0',text:'教练最终骰面为3'},{id:start+3,type:'power',source:'r0',cause:'coach',text:'教练发动同格鼓劲'},{id:start+4,type:'move',source:'r0',targets:['r0'],before:[26],after:[29],group:'gap-motion',cause:'main',text:'教练 26 → 29'});
    for(let index=0;index<400;index++)room.game.logs.push({id:start+5+index,type:'note',text:'无需额外动效的公开记录。'.repeat(12)});
    room.game.racers[0]!.position=29;room.game.lastRoll={racerId:'r0',face:3,distance:3};room.version++;
    application.rooms.rooms.set(room.code,room);application.store.save(room);
    const projected=application.rooms.view(room,room.hostId);expect(projected.logs).toHaveLength(120);expect(projected.logs.some(event=>['die','power','move'].includes(event.type))).toBe(false);
    for(const socket of application.io.sockets.sockets.values())if(socket.data.identity?.roomCode===session.code)socket.emit('snapshot',application.rooms.view(room,socket.data.identity.playerId));
    const board=session.page.getByTestId('board-3d');await expect(board).toHaveAttribute('data-phase','dice');
    await expect(board).toHaveAttribute('data-phase','skill',{timeout:15000});await expect(board).toHaveAttribute('data-phase','move',{timeout:15000});
    await expect(board).toHaveAttribute('data-phase','idle',{timeout:15000});
    expect((await phases(session.page)).filter(phase=>phase!=='idle')).toEqual(['dice','skill','move']);
    expect(requests.length).toBeGreaterThan(1);expect(requests[0]).toBe(start);expect(requests.every((cursor,index)=>index===0||cursor>requests[index-1]!)).toBe(true);
    await expect(session.page.locator('[data-testid="scene-racer"][data-racer-id="r0"]')).toHaveAttribute('data-position','29');
  }finally{await session.context.close();}
});


test('the fourth-race finished snapshot waits for its final die, movement and finish beats',async({browser})=>{
  const session=await fixture(browser,false,4);try{
    await session.page.getByRole('button',{name:'掷骰子',exact:true}).click();const board=session.page.getByTestId('board-3d');
    await expect(board).toHaveAttribute('data-phase','dice');expect(application.rooms.get(session.code).game.phase).toBe('finished');expect(await session.page.locator('.race-results-overlay').count()).toBe(0);
    await expect(board).toHaveAttribute('data-phase','finish',{timeout:15000});expect(await session.page.locator('.race-results-overlay').count()).toBe(0);
    await expect(session.page.locator('.race-results-overlay .results-panel')).toBeVisible({timeout:15000});await expect(board).toHaveAttribute('data-phase','idle');
    const observed=await phases(session.page);expect(observed.filter(phase=>phase!=='idle')).toEqual(['dice','move','finish']);
    mkdirSync('test-results/animation-sequence',{recursive:true});
    await session.page.screenshot({path:'test-results/animation-sequence/final-race-visual-complete.png'});
    writeFileSync('test-results/animation-sequence/final-race-visual-complete.json',JSON.stringify({authoritativePhase:application.rooms.get(session.code).game.phase,observed,resultsVisible:true},null,2));
  }finally{await session.context.close();}
});
