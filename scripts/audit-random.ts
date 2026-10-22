import {mkdir,writeFile} from 'node:fs/promises';
import {createRandomStream,nextRandomWord,secureRandomSeed,uniformInteger} from '../src/shared/random.js';

// Public fixture key only; this audit never reads a real room's private stream.
const seed=Array.from({length:11},(_,index)=>index);
const stream=createRandomStream(seed);for(let index=0;index<10_000;index++)uniformInteger(6,()=>nextRandomWord(stream));
const runs=[];
for(let run=0;run<3;run++){
  const counts=Array.from({length:6},()=>0),start=performance.now();
  for(let index=0;index<1_000_000;index++)counts[uniformInteger(6,()=>nextRandomWord(stream))-1]!++;
  const elapsedMs=performance.now()-start;runs.push({draws:1_000_000,elapsedMs,microsecondsPerDie:elapsedMs/1000,faces:counts});
}
const entropyStart=performance.now();for(let index=0;index<100;index++)secureRandomSeed();const seedMicroseconds=(performance.now()-entropyStart)*10;
const output={algorithm:'ChaCha20 / RFC 8439',entropy:'Web Crypto getRandomValues: 256-bit key + 96-bit nonce per new game',boundedMapping:'32-bit rejection sampling',cachedWords:16,deterministicPublicFixture:true,node:process.version,runs,seedMicroseconds,limitations:'Timing is from this machine; these finite histograms are a smoke check, not a proof of uniformity or cryptographic security. Exact range-boundary and RFC/OpenSSL comparisons are covered by tests/random.test.ts.'};
await mkdir('docs/qa/athlete-feedback',{recursive:true});await writeFile('docs/qa/athlete-feedback/random-audit.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({draws:3_000_000,medianMicrosecondsPerDie:runs.map(run=>run.microsecondsPerDie).sort((a,b)=>a-b)[1],seedMicroseconds}));
