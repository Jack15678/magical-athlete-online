/** Authority-private, JSON-persisted random stream. RFC 8439 sections 2.1–2.3. */
export interface RandomStream { algorithm:'chacha20-v1';key:number[];nonce:number[];counter:number;words:number[];offset:number }
/** Numeric seeds retain the previous test/replay stream; production uses 11 words. */
export type RandomSeed = number | readonly number[];
const RANGE=0x100000000;
export function secureRandomSeed():number[] {
  return Array.from(crypto.getRandomValues(new Uint32Array(11)));
}
export function createRandomStream(seed:readonly number[]):RandomStream {
  if(seed.length!==11||seed.some(value=>!Number.isInteger(value)||value<0||value>=RANGE))throw Error('随机种子必须包含11个32位无符号整数。');
  return {algorithm:'chacha20-v1',key:seed.slice(0,8),nonce:seed.slice(8,11),counter:0,words:[],offset:0};
}
const rotate=(value:number,bits:number)=>(value<<bits)|(value>>>(32-bits));
function quarter(x:Uint32Array,a:number,b:number,c:number,d:number) {
  x[a]=(x[a]!+x[b]!)>>>0;x[d]=rotate(x[d]!^x[a]!,16);
  x[c]=(x[c]!+x[d]!)>>>0;x[b]=rotate(x[b]!^x[c]!,12);
  x[a]=(x[a]!+x[b]!)>>>0;x[d]=rotate(x[d]!^x[a]!,8);
  x[c]=(x[c]!+x[d]!)>>>0;x[b]=rotate(x[b]!^x[c]!,7);
}
export function chacha20Block(key:readonly number[],nonce:readonly number[],counter:number):number[] {
  if(key.length!==8||nonce.length!==3||!Number.isInteger(counter)||counter<0||counter>=RANGE)throw Error('随机流参数无效或已耗尽。');
  const initial=new Uint32Array([0x61707865,0x3320646e,0x79622d32,0x6b206574,...key,counter,...nonce]),x=new Uint32Array(initial);
  for(let round=0;round<10;round++){
    quarter(x,0,4,8,12);quarter(x,1,5,9,13);quarter(x,2,6,10,14);quarter(x,3,7,11,15);
    quarter(x,0,5,10,15);quarter(x,1,6,11,12);quarter(x,2,7,8,13);quarter(x,3,4,9,14);
  }
  for(let index=0;index<16;index++)x[index]=(x[index]!+initial[index]!)>>>0;
  return Array.from(x);
}
export function nextRandomWord(stream:RandomStream):number {
  if(stream.algorithm!=='chacha20-v1')throw Error('不支持的随机流版本。');
  if(stream.offset>=stream.words.length){stream.words=chacha20Block(stream.key,stream.nonce,stream.counter++);stream.offset=0;}
  return stream.words[stream.offset++]!;
}
/** Rejection sampling, so neither dice nor Fisher–Yates bounds have modulo bias. */
export function uniformInteger(max:number,word:()=>number):number {
  if(!Number.isInteger(max)||max<1||max>RANGE)throw Error('随机范围无效。');
  const limit=RANGE-RANGE%max;
  let value:number;do{value=word();}while(value>=limit);
  return value%max+1;
}
