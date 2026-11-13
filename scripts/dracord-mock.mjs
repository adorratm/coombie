// Sahte Dracord: :3999 token doğrulama, :3000 oyunu iframe'de açan "ses kanalı" sayfası
import http from 'node:http';
const users = { u1: { id: 'u1', name: 'Emre' }, u2: { id: 'u2', name: 'Mehmet' } };
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    if (req.headers.authorization !== 'Game test-secret') { res.writeHead(401); return res.end(); }
    const u = users[(JSON.parse(b || '{}').token || '').replace('tok-', '')];
    if (!u) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ userId: u.id, username: u.name.toLowerCase(), displayName: u.name, avatarUrl: null, gameId: 'g', sessionId: 'sess-42', guildId: 'gd', channelId: 'ch', participantIds: ['u1', 'u2'], testMode: true, exp: Math.floor(Date.now() / 1000) + 600 }));
  });
}).listen(3999);
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x').searchParams.get('u') || 'u1';
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><body style="margin:0;background:#111"><iframe id="g" src="http://localhost:5173/?api=http://localhost:3001" style="border:0;width:100vw;height:100vh" allow="autoplay"></iframe><script>
const user=${JSON.stringify(users)}['${u}'];
addEventListener('message',(ev)=>{const d=ev.data;if(!d||d.source!=='dracord-embed')return;
 if(d.type==='READY'){ev.source.postMessage({source:'dracord-host',type:'INIT',payload:{protocol:1,token:'tok-'+user.id,expiresAt:new Date(Date.now()+6e5).toISOString(),user:{id:user.id,username:user.name.toLowerCase(),displayName:user.name,avatarUrl:null},session:{id:'sess-42',gameId:'g',guildId:'gd',channelId:'ch',hostUserId:'u1',participantIds:['u1','u2'],status:'active'},participants:[],platform:'web',locale:'tr',theme:'dark',testMode:true,apiBase:'http://localhost:3999'}},'*');}});
</script></body>`);
}).listen(3000);
console.log('mock up');
