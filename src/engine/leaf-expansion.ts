import { CHARACTERS } from '../shared/characters.js';
import { enabledCharacterIds } from '../shared/room-config.js';
import type { GameState, Racer, Task, PendingChoice, Player, ChoiceOption } from '../shared/types.js';

type Work=Task&Record<string,any>;
type State=GameState;
const leaf=(name:string)=>`leaf-${name}`;
export interface LeafContext {
  name:(r:Racer)=>string; live:(r:Racer)=>boolean; racer:(s:State,id:string)=>Racer|undefined;
  active:(s:State)=>Racer[]; owner:(s:State,r:Racer)=>Player; order:(s:State,rs?:Racer[])=>Racer[];
  hasPower:(s:State,r:Racer,power:string)=>boolean; powers:(s:State,power:string)=>Racer[];
  effectivePowers:(s:State,r:Racer)=>string[]; effectivePower:(s:State,r:Racer)=>string;
  ask:(s:State,r:Racer,kind:string,title:string,options:ChoiceOption[],context:Record<string,any>,optional?:boolean)=>void;
  askTarget:(s:State,r:Racer,kind:string,title:string,targets:Racer[],context?:Record<string,any>,optional?:boolean)=>void;
  targetOptions:(s:State,ids:string[])=>ChoiceOption[]; yesNo:ChoiceOption[];
  usePower:(s:State,r:Racer,tasks:Work[],power?:string,fallback?:Work[])=>void; push:(s:State,...tasks:Work[])=>void;
  log:(s:State,type:string,text:string,detail?:Record<string,any>)=>void;
  points:(s:State,r:Racer,delta:number,cause:string)=>void; shuffle:(s:State,ids:string[])=>string[];
}
export function installLeaf(ctx:LeafContext){
  const {name,live,racer,active,owner,order,hasPower,powers,ask,askTarget,targetOptions,usePower,push,log,points,shuffle}=ctx;
  const has=(s:State,r:Racer,id:string)=>hasPower(s,r,leaf(id));
  const title=(id:string)=>CHARACTERS.find(card=>card.id===id)?.nameZh??id;
  const effect=(r:Racer,power:string,effects:Work[],detail:Record<string,any>={}):Work=>({kind:'ability',racerId:r.id,power:leaf(power),effects,...detail});
  const done=(r:Racer,power:string):Work=>({kind:'powerDone',racerId:r.id,power:leaf(power)});
  const task=(r:Racer,step:string,extra:Record<string,any>={}):Work=>({kind:'leaf',racerId:r.id,step,...extra});
  const aloneLast=(s:State,r:Racer)=>active(s).every(other=>other.id===r.id||other.position>r.position);
  function availableDeck(s:State):void{
    const enabled=new Set(enabledCharacterIds(s.config,s.characterPool,s.mode==='practice'));
    // Recovered v3 state may predate a repaired pack configuration. Keep the
    // relative order of valid cards, without drawing or shuffling forbidden ones.
    s.deck=s.deck.filter(id=>enabled.has(id));
    if(s.deck.length)return;
    const displayed=new Set(s.racers.map(r=>String(r.flags.leafDisplayedCard??'')).filter(Boolean));
    const cards=s.discard.filter(id=>enabled.has(id)&&!displayed.has(id));
    if(cards.length){s.deck=shuffle(s,[...new Set(cards)]);s.discard=s.discard.filter(id=>!cards.includes(id));log(s,'shuffle','Leaf：未选牌堆耗尽，洗公共弃牌堆。',{cause:'leaf-deck'});}
  }
  function draw(s:State,count:number):string[]{
    const cards:string[]=[];for(let i=0;i<count;i++){availableDeck(s);const id=s.deck.shift();if(!id)break;cards.push(id);}return cards;
  }
  function turnBoundary(_s:State,r:Racer):void{
    const previous=r.flags.leafBorrowedPower;
    if(typeof previous==='string'&&!r.flags.leafBorrowAlreadyPresent)r.flags.acquiredPowers=((r.flags.acquiredPowers??[]) as string[]).filter(power=>power!==previous);
    delete r.flags.leafBorrowedPower;delete r.flags.leafBorrowAlreadyPresent;
  }
  function clearBorrow(s:State,r:Racer):void{
    turnBoundary(s,r);
    const displayed=r.flags.leafDisplayedCard;if(typeof displayed==='string')s.discard.push(displayed);
    delete r.flags.leafDisplayedCard;
  }
  function borrow(s:State,r:Racer,id:string,source:string):void{
    clearBorrow(s,r);const acquired=(r.flags.acquiredPowers??[]) as string[];
    r.flags.leafBorrowAlreadyPresent=acquired.includes(id);r.flags.leafBorrowedPower=id;r.flags.leafDisplayedCard=id;
    r.flags.acquiredPowers=[...new Set([...acquired,id])];
    log(s,'copy',`${name(r)}公开弃出并复制「${title(id)}」，持续到自己下回合换牌，不执行赛前能力。`,{source:r.id,cause:source,selectedCardId:id});
  }
  function beforeRace(s:State,r:Racer,p:string):boolean{
    if(!p.startsWith('leaf-'))return false;
    const prepared=(r.flags.leafPrepared??=[]) as string[];if(prepared.includes(p))return true;prepared.push(p);
    if(p===leaf('crash-dummy'))usePower(s,r,[{kind:'trip',racerId:r.id,source:r.id}],p);
    if(p===leaf('race-car'))usePower(s,r,[{kind:'gain',racerId:r.id,amount:2}],p);
    if(p===leaf('loan-shark')){
      for(const target of active(s).filter(other=>other.playerId!==r.playerId)){
        const tokens=(target.flags.leafLoanTokens??={}) as Record<string,boolean>;tokens[r.id]=true;
      }
      log(s,'resource',`${name(r)}给每名对手的选手牌放1枚待领取积分筹码；同一控制者的另一选手不领取。`,{source:r.id,targets:active(s).filter(other=>other.playerId!==r.playerId).map(other=>other.id),cause:p});
      push(s,done(r,'loan-shark'));
    }
    if(p===leaf('filmmaker')){
      r.flags.secretLeafHand=draw(s,7);log(s,'draw',`${name(r)}抽取${(r.flags.secretLeafHand as string[]).length}张私人影片手牌。`,{source:r.id,cause:p});push(s,done(r,'filmmaker'));
    }
    if(p===leaf('zombie')){
      const enabled=new Set(enabledCharacterIds(s.config,s.characterPool,s.mode==='practice'));
      const candidates=[...new Set((s.flags.leafPastLosers??[]) as string[])].filter(id=>id!==p&&enabled.has(id)&&CHARACTERS.some(card=>card.id===id));
      if(candidates.length)ask(s,r,'leaf-zombie','僵尸：可选择此前失利角色的印刷能力',[...candidates.map(id=>({id,label:title(id)})),{id:'skip',label:'不复制'}],{candidates},true);
    }
    return true;
  }
  function turnStart(s:State,r:Racer,p:string):boolean{
    if(!p.startsWith('leaf-'))return false;
    if(p===leaf('dark-horse'))r.flags.leafDarkTurn=aloneLast(s,r)?s.turnCount:-1;
    if(p===leaf('lonely-wolf')){r.flags.leafWolfTurn=s.turnCount;r.flags.leafWolfBonus=active(s).some(other=>other.id!==r.id&&other.position===r.position)?2:1;}
    if(p===leaf('revolutionary')&&aloneLast(s,r)){
      const lead=Math.max(...active(s).map(other=>other.position));
      if(lead!==r.position)usePower(s,r,[{kind:'warp',racerId:r.id,position:lead,cause:p}],p);
    }
    return true;
  }
  function mainReady(s:State,r:Racer):boolean{
    if(has(s,r,'thespian')&&r.flags.leafBorrowTurn!==s.turnCount){
      r.flags.leafBorrowTurn=s.turnCount;clearBorrow(s,r);const id=draw(s,1)[0];
      if(id)borrow(s,r,id,leaf('thespian'));else log(s,'power',`${name(r)}没有可弃的未选角色牌，保留自身能力。`,{source:r.id,cause:leaf('thespian')});
      push(s,{kind:'mainReady',racerId:r.id});return true;
    }
    if(has(s,r,'filmmaker')&&r.flags.leafBorrowTurn!==s.turnCount){
      r.flags.leafBorrowTurn=s.turnCount;clearBorrow(s,r);const hand=(r.flags.secretLeafHand??[]) as string[];
      if(hand.length){ask(s,r,'leaf-film-card','电影制作人：选择本回合公开弃出并复制的一张牌',hand.map(id=>({id,label:title(id)})),{});return true;}
    }
    const gifts=(r.flags.leafGiftDice??[]) as {id:string;face:number;source:string}[];
    if(gifts.length&&!r.flags.mainRolled){
      if(gifts.length>1){ask(s,r,'leaf-gift-die','多枚赠骰同时生效：选择本回合使用的一枚，其余回合末弃置',gifts.map(gift=>({id:gift.id,label:`${gift.face}点（${name(racer(s,gift.source)??r)}赠送）`})),{});return true;}
      r.flags.mainRolled=true;log(s,'gift-die',`${name(r)}使用已公开的${gifts[0]!.face}点赠骰，代替本回合主移动掷骰。`,{source:gifts[0]!.source,targets:[r.id],faces:[gifts[0]!.face],cause:leaf('philanthropist')});
      push(s,{kind:'mainMove',racerId:r.id,base:gifts[0]!.face});return true;
    }
    if(has(s,r,'philanthropist')&&!r.flags.mainRolled&&r.flags.leafPhilanthropistTurn!==s.turnCount){
      // Rolling is still a human action: core rollDie uses this marker to ask
      // for two dice instead of silently executing a non-current player's die.
      r.flags.leafPhilanthropistTurn=s.turnCount;r.flags.leafPhilanthropistRoll=true;
    }
    return false;
  }
  function finalRoll(s:State,r:Racer,face:number,_firstTasks:Work[]):boolean{
    if(has(s,r,'toucan')&&face===2&&r.flags.leafToucanTurn!==s.turnCount){
      r.flags.leafToucanTurn=s.turnCount;ask(s,r,'leaf-toucan','巨嘴鸟：主骰为2，可调整到1～6任意点',Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{face},true);return true;
    }
    if(has(s,r,'race-car')&&owner(s,r).score>0&&r.flags.leafCarAskedTurn!==s.turnCount){
      r.flags.leafCarAskedTurn=s.turnCount;ask(s,r,'leaf-race-car',`赛车：主骰${face}，花1分使本次主移动+3？`,ctx.yesNo,{face},true);return true;
    }
    return false;
  }
  function distance(s:State,r:Racer,value:number,base:number,effects:Work[]):number{
    if(has(s,r,'dark-horse')&&r.flags.leafDarkTurn===s.turnCount){value+=base;effects.push(done(r,'dark-horse'));}
    if(has(s,r,'crash-dummy')){value+=2;effects.push(done(r,'crash-dummy'));}
    if(has(s,r,'lonely-wolf')){const bonus=Number(r.flags.leafWolfTurn===s.turnCount?r.flags.leafWolfBonus:1);value+=bonus;effects.push(done(r,'lonely-wolf'));}
    if(has(s,r,'nepo-baby')){const bonus=s.results.flatMap(result=>result.placements).filter(place=>place.playerId===r.playerId&&(place.rank===1||place.rank===2)).length;value+=bonus;if(bonus)effects.push(done(r,'nepo-baby'));}
    if(has(s,r,'sole-survivor')){const bonus=Number(r.flags.leafRaceIncome??0);value+=bonus;if(bonus)effects.push(done(r,'sole-survivor'));}
    if(r.flags.leafCarBonusTurn===s.turnCount)value+=3;
    return value;
  }
  function choice(s:State,r:Racer,c:PendingChoice,id:string):boolean{
    if(!c.kind.startsWith('leaf-'))return false;const context=c.context as Record<string,any>;
    if(c.kind==='leaf-zombie'){
      if(id==='skip')return true;
      if(!(context.candidates as string[]).includes(id))throw Error('僵尸复制目标无效。');
      usePower(s,r,[task(r,'zombie-copy',{characterId:id})],leaf('zombie'));return true;
    }
    if(c.kind==='leaf-film-card'){
      const hand=(r.flags.secretLeafHand??[]) as string[];if(!hand.includes(id))throw Error('该影片不在你的私人手牌中。');
      usePower(s,r,[task(r,'film-copy',{characterId:id}),{kind:'mainReady',racerId:r.id}],leaf('filmmaker'),[{kind:'mainReady',racerId:r.id}]);return true;
    }
    if(c.kind==='leaf-race-car'){
      if(id==='use'){if(owner(s,r).score<1)throw Error('积分不足，不能使用赛车加速。');usePower(s,r,[task(r,'car-spend'),{kind:'finalRoll',racerId:r.id,face:Number(context.face)}],leaf('race-car'),[{kind:'finalRoll',racerId:r.id,face:Number(context.face)}]);}
      else push(s,{kind:'finalRoll',racerId:r.id,face:Number(context.face)});return true;
    }
    if(c.kind==='leaf-toucan'){const face=Number(id);if(!Number.isInteger(face)||face<1||face>6)throw Error('调整骰面无效。');if(face===2)push(s,{kind:'finalRoll',racerId:r.id,face});else usePower(s,r,[task(r,'toucan-adjust',{face})],leaf('toucan'),[{kind:'finalRoll',racerId:r.id,face:2}]);return true;}
    if(c.kind==='leaf-philanthropist-die'){
      const faces=context.faces as number[],index=Number(id);if(index!==0&&index!==1)throw Error('请选择本次掷出的骰子。');
      const ownFace=faces[index]!,giftFace=faces[1-index]!,targets=active(s).filter(target=>target.id!==r.id);
      if(targets.length)askTarget(s,r,'leaf-philanthropist-target',`慈善家：自己使用${ownFace}点，将${giftFace}点赠给哪名选手？`,targets,{ownFace,giftFace});
      else push(s,{kind:'finalRoll',racerId:r.id,face:ownFace},done(r,'philanthropist'));return true;
    }
    if(c.kind==='leaf-philanthropist-target'){
      const target=racer(s,id);if(!target||!live(target)||target.id===r.id)throw Error('赠骰目标已经失效。');
      const gifts=(target.flags.leafGiftDice??=[]) as {id:string;face:number;source:string}[];gifts.push({id:`${r.id}:${s.turnCount}:${gifts.length}`,face:Number(context.giftFace),source:r.id});
      log(s,'gift-die',`${name(r)}选择${context.ownFace}点主移动，并将${context.giftFace}点赠骰交给${name(target)}，供其下一次主移动使用。`,{source:r.id,targets:[target.id],faces:[Number(context.ownFace),Number(context.giftFace)],cause:leaf('philanthropist')});
      push(s,{kind:'finalRoll',racerId:r.id,face:Number(context.ownFace)},done(r,'philanthropist'));return true;
    }
    if(c.kind==='leaf-gift-die'){
      const gifts=(r.flags.leafGiftDice??[]) as {id:string;face:number;source:string}[],chosen=gifts.find(gift=>gift.id===id);if(!chosen)throw Error('赠骰已经失效。');
      r.flags.mainRolled=true;push(s,{kind:'mainMove',racerId:r.id,base:chosen.face});return true;
    }
    return false;
  }
  function rollResult(s:State,r:Racer,t:Work,faces:number[],_context:Record<string,any>):boolean{
    if(t.purpose!=='leaf-philanthropist')return false;
    r.flags.mainRolled=true;delete r.flags.leafPhilanthropistRoll;
    log(s,'multi-dice',`${name(r)}主移动掷出${faces.join('、')}；等待其选择使用与赠出的骰子。`,{source:r.id,faces,cause:leaf('philanthropist')});
    ask(s,r,'leaf-philanthropist-die','慈善家：选择自己主移动使用的一枚骰子',faces.map((face,index)=>({id:String(index),label:`使用${face}点，赠出${faces[1-index]}点`})),{faces});return true;
  }
  function stopTasks(s:State,arrivals:string[],_before:Record<string,number>,motion:Work):Work[]{
    const tasks:Work[]=[];
    for(const source of order(s)){
      if(has(s,source,'crash-dummy')&&motion.cause==='main'&&arrivals.includes(source.id)){
        const sharing=active(s).filter(target=>target.position===source.position);
        if(sharing.length>1)tasks.push(effect(source,'crash-dummy',sharing.map(target=>({kind:'trip',racerId:target.id,source:source.id})),{priority:'pre-stop'}));
      }
      if(has(s,source,'kangaroo'))for(const id of arrivals){const target=racer(s,id);if(target&&target.id!==source.id&&target.position===source.position+1)tasks.push(effect(source,'kangaroo',[{kind:'move',racerId:source.id,distance:2,cause:leaf('kangaroo')}]));}
      if(has(s,source,'loan-shark'))for(const target of active(s).filter(target=>target.id!==source.id&&target.position===source.position&&(arrivals.includes(source.id)||arrivals.includes(target.id)))){
        if((target.flags.leafLoanTokens as Record<string,boolean>|undefined)?.[source.id])tasks.push(effect(source,'loan-shark',[task(source,'collect-loan',{targetId:target.id})]));
      }
    }
    return tasks;
  }
  function passTasks(s:State,moving:Racer,crossed:Racer[]):Work[]{
    return crossed.filter(target=>has(s,target,'catfish')&&moving.position>target.position).map(target=>effect(target,'catfish',[{kind:'move',racerId:target.id,distance:1,cause:leaf('catfish')}]));
  }
  function rawDie(s:State,_roller:Racer,raw:number):Work[]{
    return raw===3?powers(s,leaf('triangle-man')).map(source=>effect(source,'triangle-man',[{kind:'move',racerId:source.id,distance:1,cause:leaf('triangle-man')}])):[];
  }
  /** Called for every actual positive income, even before copying Survivor. */
  function trackIncome(_s:State,r:Racer,delta:number):void{if(delta>0)r.flags.leafRaceIncome=Number(r.flags.leafRaceIncome??0)+delta;}
  /** Returns true only when a trip must be prevented. */
  function preventTrip(s:State,r:Racer):boolean{
    if(!has(s,r,'catfish'))return false;log(s,'trip-blocked',`${name(r)}侧躺比赛，不会绊倒。`,{source:r.id,cause:leaf('catfish')});return true;
  }
  function onTrip(s:State,r:Racer,wasTripped:boolean):void{if(!wasTripped&&has(s,r,'sole-survivor'))points(s,r,1,'唯一幸存者绊倒奖励');}
  function recover(s:State,r:Racer):boolean{
    if(!has(s,r,'spiteful-spirit'))return false;
    usePower(s,r,[{kind:'move',racerId:r.id,distance:1,cause:leaf('spiteful-spirit')},...order(s,active(s).filter(other=>other.id!==r.id)).map(other=>({kind:'trip',racerId:other.id,source:r.id}))],leaf('spiteful-spirit'));return true;
  }
  function endTurn(s:State,r:Racer):void{
    if((r.flags.leafGiftDice as unknown[]|undefined)?.length){log(s,'discard-die',`${name(r)}的本回合结束，尚未使用的赠骰弃置。`,{source:r.id,cause:leaf('philanthropist')});delete r.flags.leafGiftDice;}
  }
  function raceEnd(s:State,cycleDraw=false):void{
    s.flags.leafPastLosers=[...new Set([...((s.flags.leafPastLosers??[]) as string[]),...s.racers.filter(r=>r.rank!==1&&r.rank!==2).map(r=>r.characterId)])];
    if(cycleDraw)return;
    for(const target of s.racers){const tokens=target.flags.leafLoanTokens as Record<string,boolean>|undefined;if(!tokens)continue;const retained=Object.values(tokens).filter(Boolean).length;delete target.flags.leafLoanTokens;if(retained)points(s,target,retained,'高利贷鲨未收回的卡面筹码');}
    const candidates=s.racers.filter(r=>!r.eliminated),last=Math.min(...candidates.map(r=>r.position)),back=candidates.filter(r=>r.position===last);
    if(back.length===1&&has(s,back[0]!,'sore-loser'))points(s,back[0]!,3,'输不起独自末位奖励');
  }
  function processTask(s:State,r:Racer,t:Work):boolean{
    if(t.step==='zombie-copy'){
      const power=String(t.characterId);
      // A saved reaction/continuation can already contain the selected card.
      // Recheck at execution as well as when constructing the target options.
      if(!enabledCharacterIds(s.config,s.characterPool,s.mode==='practice').includes(power)){
        log(s,'cancel',`${name(r)}的历史复制来源已不在本房间启用角色包中，本次复制取消。`,{source:r.id,cause:leaf('zombie')});return true;
      }
      r.flags.acquiredPowers=[...new Set([...((r.flags.acquiredPowers??[]) as string[]),power])];r.flags.leafZombieCard=power;
      log(s,'copy',`${name(r)}本场获得此前失利角色「${title(power)}」的印刷能力，并执行其赛前效果。`,{source:r.id,cause:leaf('zombie'),selectedCardId:power});push(s,{kind:'beforeRacePower',racerId:r.id,power});return true;
    }
    if(t.step==='film-copy'){
      const power=String(t.characterId),hand=(r.flags.secretLeafHand??[]) as string[];if(!hand.includes(power))throw Error('影片复制时手牌已失效。');
      r.flags.secretLeafHand=hand.filter(card=>card!==power);borrow(s,r,power,leaf('filmmaker'));return true;
    }
    if(t.step==='car-spend'){if(owner(s,r).score<1)throw Error('赛车结算时积分不足。');points(s,r,-1,'赛车加速');r.flags.leafCarBonusTurn=s.turnCount;return true;}
    if(t.step==='toucan-adjust'){log(s,'die-adjusted',`${name(r)}将主骰2调整为${t.face}，不产生一次新掷骰。`,{source:r.id,faces:[2,Number(t.face)],cause:leaf('toucan')});push(s,{kind:'finalRoll',racerId:r.id,face:Number(t.face)});return true;}
    if(t.step!=='collect-loan')return false;
    const target=racer(s,String(t.targetId)),tokens=target?.flags.leafLoanTokens as Record<string,boolean>|undefined;
    if(target&&live(target)&&target.position===r.position&&tokens?.[r.id]){delete tokens[r.id];points(s,r,1,`高利贷鲨从${name(target)}牌面收回筹码`);}return true;
  }
  return {beforeRace,turnStart,turnBoundary,mainReady,finalRoll,distance,choice,rollResult,stopTasks,passTasks,rawDie,trackIncome,preventTrip,onTrip,recover,endTurn,raceEnd,task:processTask};
}
