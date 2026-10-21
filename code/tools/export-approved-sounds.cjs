// Export the exact approved listening-page algorithms at their chosen defaults.
// Run with the preview on :4173 and Chrome debugging on :9227.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);} });
  const send = (method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const run = async expression => { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value; };
  const report = { note: 'Rendered from sound-test.html at approved settings, then quantized to 16-bit PCM. Originals preserved. No listening evaluation.', files: [] };
  try {
    await send('Page.enable'); await send('Page.navigate',{url:'http://127.0.0.1:4173/sound-test.html'});
    for(let i=0;i<40;i++){try{if(await run('typeof renderTone === "function"'))break;}catch{}await new Promise(r=>setTimeout(r,100));}
    for (const [name, expression] of Object.entries({ curious: "renderTone('curious',{...toneDefaults.curious})", happy: "renderTone('happy',{...toneDefaults.happy})", 'wake-adjusted': "renderRecording('wake-adjusted',{...defaults})", 'afraid-adjusted': "renderRecording('afraid-adjusted',{...defaults})" })) {
      const result = await run(`(async()=>{const b=await ${expression};return {sampleRate:b.sampleRate,channels:b.numberOfChannels,length:b.length,duration:b.duration,data:Array.from({length:b.numberOfChannels},(_,c)=>{const bytes=new Uint8Array(b.getChannelData(c).buffer);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);})};})()`);
      const data = result.data.map(s=>{const b=Buffer.from(s,'base64');return new Float32Array(b.buffer,b.byteOffset,b.length/4);});
      const bytesPerFrame=result.channels*2, wav=Buffer.alloc(44+result.length*bytesPerFrame);
      wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(result.channels,22);wav.writeUInt32LE(result.sampleRate,24);wav.writeUInt32LE(result.sampleRate*bytesPerFrame,28);wav.writeUInt16LE(bytesPerFrame,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
      let peak=0;
      for(let i=0;i<result.length;i++)for(let c=0;c<result.channels;c++){const v=data[c][i];if(!Number.isFinite(v)||Math.abs(v)>1)throw Error('Invalid sample');peak=Math.max(peak,Math.abs(v));wav.writeInt16LE(Math.round(v*32767),44+i*bytesPerFrame+c*2);}
      const file='sounds/'+name+'.wav';fs.writeFileSync(path.join(__dirname,'..',file),wav);
      const entry={file,duration:result.duration,sampleRate:result.sampleRate,channels:result.channels,peak,sha256:crypto.createHash('sha256').update(wav).digest('hex')};report.files.push(entry);console.log(JSON.stringify(entry));
    }
    for(const name of ['wake.mp3','afraid.mp3','waterfall.mp3']){const b=fs.readFileSync(path.join(__dirname,'../sounds',name));report.files.push({file:'sounds/'+name,original:true,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
    fs.writeFileSync(path.join(__dirname,'../sounds/approved-manifest.json'),JSON.stringify(report,null,2));
  }finally{await send('Page.close').catch(()=>{});ws.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
