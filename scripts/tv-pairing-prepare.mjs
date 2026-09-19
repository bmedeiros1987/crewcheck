import {readFile,writeFile} from 'node:fs/promises';
function replace(s,old,value){if(!s.includes(old))throw Error('Pairing anchor changed: '+old.slice(0,60));return s.replace(old,value);}
const core='packages/tv-core/src/session.ts';let session=await readFile(core,'utf8');
if(!session.includes('invokeTvRequest')){
 session="import { invokeTvRequest } from './nativeRequest';\n"+session;
 session=replace(session,'this.request(`${this.origin}/api/tv/${path}`, init)','invokeTvRequest(this.request, `${this.origin}/api/tv/${path}`, init)');
 await writeFile(core,session);
}
const file='apps/tv-player/src/main.tsx';let main=await readFile(file,'utf8');
if(!main.includes("from './PairingDiagnostics'")){
 main=replace(main,"const session = new TvSession(sessionStorage, fetch, config.VITE_TV_API_ORIGIN || 'https://crewcheck.online');","const session = new TvSession(sessionStorage, fetch, config.VITE_TV_API_ORIGIN || 'https://crewcheck.online', localStorage);");
 main=replace(main,"  const [status, setStatus] = useState(demo ? 'Dados fictícios · teste visual' : 'Vincule sua TV');","  const [status, setStatus] = useState(demo ? 'Dados fictícios · teste visual' : session.credential?.trusted ? 'Restaurando TV confiável…' : 'Vincule sua TV');");
 main=replace(main,"  const clear = () => {\n    generation.current++;\n    session.clear();","  const clear = (forgetTrusted = true) => {\n    generation.current++;\n    session.clear(forgetTrusted);");
 main=replace(main,"import QRCode from 'qrcode';","import QRCode from 'qrcode';\nimport { PairingDiagnostics, validatePairing, pairingFailure } from './PairingDiagnostics';\nimport { SyncProgress, type SyncStage } from './SyncProgress';");
 main=replace(main,"  const [qr, setQr] = useState('');","  const [qr, setQr] = useState('');\n  const [pairBusy, setPairBusy] = useState(false);\n  const pairBusyRef = useRef(false);\n  const [pairDiagnostic, setPairDiagnostic] = useState('');\n  const [trustedTv, setTrustedTv] = useState(()=>{try{return localStorage.getItem('crewcheck-tv-trusted-choice')!=='false';}catch{return true;}});\n  const [syncStage, setSyncStage] = useState<SyncStage | null>(()=>session.credential?.trusted?'roster':null);");
 const start=main.indexOf('  async function begin() {'),end=main.indexOf('  useEffect(() => {',start);
 if(start<0||end<0)throw Error('Pairing block missing');
 main=main.slice(0,start)+`  async function begin() {
    if (demo) { clear(); return; }
    if (pairBusyRef.current) return;
    pairBusyRef.current=true; setPairBusy(true); clear(false); setPairDiagnostic(''); setSyncStage(null);
    const run=generation.current;
    setStatus('Conectando ao servidor…');
    try {
      try{localStorage.setItem('crewcheck-tv-trusted-choice',String(trustedTv));}catch{}
      const raw=await session.call('pair',{platform,trusted:trustedTv});
      if(run!==generation.current) return;
      const p=validatePairing(raw,config.VITE_TV_API_ORIGIN || 'https://crewcheck.online');
      setPairing(p); setStatus('Confirme no celular. O código já está disponível.');
      try {
        const image=await QRCode.toDataURL(p.verificationUri);
        if(run===generation.current) setQr(image);
      } catch {
        if(run===generation.current){setQr('');setPairDiagnostic('TV-QR-01');setStatus('Código criado. Abra o endereço no celular e digite o código.');}
      }
    } catch(error) {
      if(run===generation.current){const problem=pairingFailure(error);setPairDiagnostic(problem.code);setStatus(problem.message);}
    } finally {pairBusyRef.current=false;setPairBusy(false);}
  }
  async function checkConnection() {
    if(pairBusyRef.current || demo) return;
    pairBusyRef.current=true;setPairBusy(true);setPairDiagnostic('');
    const run=generation.current;
    try {
      const result=await session.call('status');
      if(run!==generation.current) return;
      if(result?.schemaVersion===1 && result.available===true && result.pairing===true){setStatus('Servidor acessível. Pressione Vincular TV.');setPairDiagnostic('TV-CONNECT-OK');}
      else {setStatus('O servidor não confirmou a disponibilidade do vínculo.');setPairDiagnostic('TV-SERVICE-OFF');}
    } catch(error) {if(run===generation.current){const problem=pairingFailure(error);setStatus(problem.message);setPairDiagnostic(problem.code);}}
    finally {pairBusyRef.current=false;setPairBusy(false);}
  }
`+main.slice(end);
 main=replace(main,"  }, [pairing]);\n  useEffect(() => {",
`  }, [pairing]);
  useEffect(() => {
    if (demo || !session.credential?.trusted) return;
    let alive=true;
    const restore=async()=>{
      setSyncStage('roster');setStatus('Restaurando TV confiável…');
      try{
        const value=await session.sync();
        if(!alive)return;
        setSyncStage('dashboard');setStatus('Preparando seu painel…');
        await new Promise(resolve=>setTimeout(resolve,260));
        if(!alive)return;
        setSnapshot(value);setSyncStage(null);setStatus('Sincronizado');
        try{const lease=await session.call('heartbeat',{});if(lease?.expiresAt)session.renew(lease.expiresAt);}catch{}
      }catch(error){
        if(!alive)return;
        setSyncStage(null);const problem=pairingFailure(error);setPairDiagnostic(problem.code);
        setStatus(session.credential?'Sem conexão · tentaremos novamente':'Vincule sua TV');
      }
    };
    void restore();
    return()=>{alive=false;};
  }, []);
  useEffect(() => {`);
 main=replace(main,"        await session.call('heartbeat', {});","        const lease=await session.call('heartbeat', {});\n        if(lease?.expiresAt)session.renew(lease.expiresAt);");
 main=replace(main,'          session.pair(result);',
`          setPairing(null); setQr(''); setSyncStage('authorized'); setStatus('TV autorizada com sucesso.');
          session.pair(result);
          setSyncStage('validating'); setStatus('Validando vínculo seguro…');
          await new Promise(resolve=>setTimeout(resolve,140));
          setSyncStage('roster'); setStatus('Sincronizando sua escala…');`);
 main=replace(main,"          setSnapshot(value); setPairing(null); setQr(''); setStatus('Sincronizado');",
`          setSyncStage('dashboard'); setStatus('Preparando seu painel…');
          await new Promise(resolve=>setTimeout(resolve,320));
          if (cancelled || run !== generation.current) return;
          setSnapshot(value); setSyncStage(null); setPairing(null); setQr(''); setStatus('Sincronizado');`);
 main=replace(main,"} catch { if (!cancelled && run === generation.current) setStatus('Aguardando confirmação ou conexão.'); }","} catch(error) { if (run === generation.current) { setSyncStage(null); const problem=pairingFailure(error);setPairDiagnostic(problem.code);setStatus(session.credential?'TV autorizada; a escala ainda não pôde ser carregada.':problem.message); } }");
 const a=main.indexOf(': !snapshot ? <section className="pair view-enter">'),b=main.indexOf('</section> : <>',a);
 if(a<0||b<0)throw Error('Pairing JSX boundary changed');
 main=main.slice(0,a)+': !snapshot ? (syncStage ? <SyncProgress stage={syncStage}/> : <PairingDiagnostics status={status} code={pairDiagnostic} busy={pairBusy} pairing={pairing} qr={qr} origin={config.VITE_TV_API_ORIGIN || \'https://crewcheck.online\'} trusted={trustedTv} onTrustedChange={value=>{setTrustedTv(value);try{localStorage.setItem('crewcheck-tv-trusted-choice',String(value));}catch{}}} onBegin={begin} onCheck={checkConnection}/>) : <>'+main.slice(b+'</section> : <>'.length);
 main=replace(main,"'Autorização de até 24 horas; reiniciar exige novo pareamento neste piloto.'","session.credential?.trusted ? 'TV confiável: o vínculo permanece neste aparelho até você desvincular ou revogar pelo celular.' : 'Vínculo temporário: reiniciar exige novo pareamento.'");
 main=replace(main,"<button onClick={() => { clear(); window.close(); }}>Sair</button>","<button onClick={() => { window.close(); }}>Fechar app</button>");
 main=main.replaceAll('Prévia visual 0.1.7','Prévia visual 0.2.1');
 await writeFile(file,main);
}
console.log('Prepared native-fetch receiver fix, non-secret diagnostics and independent QR fallback.');
