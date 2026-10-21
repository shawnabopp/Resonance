// Decode the actual MP3 files in Chrome, without playing them. Requires :4173 and :9227.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  try {
    await send('Page.enable'); await send('Page.navigate', { url: 'http://127.0.0.1:4173/sound-test.html' });
    await new Promise(r => setTimeout(r, 500));
    const result = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async()=>{
      const decode=new OfflineAudioContext(2,1,48000), result={};
      async function measure(buffer){
        const sr=buffer.sampleRate,step=Math.round(sr*.01),windows=[];let peak=0,total=0,clipped=0;
        for(let start=0;start<buffer.length;start+=step){let sum=0,max=0;const end=Math.min(buffer.length,start+step);
          for(let c=0;c<buffer.numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=start;i<end;i++){const v=data[i];sum+=v*v;max=Math.max(max,Math.abs(v));if(Math.abs(v)>=.999)clipped++;}}
          total+=sum;peak=Math.max(peak,max);windows.push({time:start/sr,rms:Math.sqrt(sum/((end-start)*buffer.numberOfChannels)),peak:max});}
        const top=Math.max(...windows.map(w=>w.rms)),active=windows.filter(w=>w.rms>top*.1),nonSilent=windows.filter(w=>w.rms>top*.01);
        const band=new OfflineAudioContext(buffer.numberOfChannels,buffer.length,sr),source=band.createBufferSource(),hp=band.createBiquadFilter();
        source.buffer=buffer;hp.type='highpass';hp.frequency.value=3500;hp.Q.value=.707;source.connect(hp).connect(band.destination);source.start();const high=await band.startRendering();let highEnergy=0;
        for(let c=0;c<high.numberOfChannels;c++)for(const v of high.getChannelData(c))highEnergy+=v*v;
        return {duration:buffer.duration,sampleRate:sr,channels:buffer.numberOfChannels,peak,peakDb:20*Math.log10(peak),rms:Math.sqrt(total/(buffer.length*buffer.numberOfChannels)),activeRms:Math.sqrt(active.reduce((s,w)=>s+w.rms*w.rms,0)/active.length),peakWindowRms:top,leadingQuiet:nonSilent[0]?.time||0,trailingQuiet:buffer.duration-(nonSilent.at(-1)?.time+.01||0),clippedSamples:clipped,highpass3500EnergyRatio:highEnergy/total,edges:Array.from({length:buffer.numberOfChannels},(_,c)=>[buffer.getChannelData(c)[0],buffer.getChannelData(c).at(-1)]),windows};
      }
      for(const name of ['afraid','wake']){const response=await fetch('./sounds/'+name+'.mp3');if(!response.ok)throw Error(response.status);result[name]=await measure(await decode.decodeAudioData(await response.arrayBuffer()));}
      result.curious=await measure(await renderTone('curious',{...defaults}));
      result.happy=await measure(await renderTone('happy',{...toneDefaults.happy}));return result;
    })()` });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    const report = { method: 'Decoded sample metrics; no listening evaluation. Active RMS excludes 10 ms windows below 10% of the largest window RMS. Quiet edges use 1% threshold. These are not LUFS measurements.', sounds: result.result.value };
    for (const name of ['afraid', 'wake']) {
      const bytes = fs.readFileSync(path.join(__dirname, '../sounds', name + '.mp3'));
      report.sounds[name].sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      report.sounds[name].bytes = bytes.length;
    }
    fs.writeFileSync(path.join(__dirname, '../qa/source-sound-analysis.json'), JSON.stringify(report, null, 2));
    for (const [name, value] of Object.entries(report.sounds)) { const { windows, ...summary } = value; console.log(name, JSON.stringify(summary)); }
  } finally { await send('Page.close').catch(() => {}); ws.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
