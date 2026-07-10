import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Eye, Lock, Mail, Plane, ShieldCheck, Sparkles } from 'lucide-react';
import { login, register } from '@/lib/authClient';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const light = localStorage.getItem('crewcheck_theme_mode') === 'light' || localStorage.getItem('crewcheck_light_premium') === '1'; document.documentElement.dataset.crewTheme = light ? 'light' : 'dark'; document.documentElement.classList.toggle('dark', !light); document.documentElement.style.colorScheme = light ? 'light' : 'dark'; localStorage.setItem('crewcheck_last_loaded_version', '13.5.1'); }, []);
  async function submit() {
    if (!email || !password) { toast.info('Informe e-mail e senha.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ email, password, confirmPassword: password, name: name || email.split('@')[0], usageIntent: 'crewcheck-premium' }) as any;
      toast.success('Bem-vindo ao CrewCheck Premium.');
      setLocation('/');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha no acesso.'); }
    finally { setBusy(false); }
  }
  function demo() {
    localStorage.setItem('crewcheck_demo_mode_seen', '1');
    sessionStorage.setItem('crewcheck_demo_active', '1');
    toast.success('Modo demonstração liberado.');
    setLocation('/');
  }
  return <main className="cz-auth" data-version="13.5.1"><div className="cz-wallpaper"/><section className="cz-auth-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><p><em>Premium</em><b>Beta</b></p></section><section className="cz-login-card"><div className="cz-tabs"><button className={mode==='login'?'active':''} onClick={() => setMode('login')}>Entrar</button><button className={mode==='register'?'active':''} onClick={() => setMode('register')}>Criar cadastro</button></div><small>Acesso ao sistema</small><h1>{mode === 'login' ? 'Bem-vindo de volta.' : 'Criar conta CrewCheck.'}</h1><p>Entre para carregar sua escala e continuar de onde parou.</p>{mode === 'register' && <label><UserIcon/> Nome completo<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome"/></label>}<label><Mail/> E-mail cadastrado *<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu.email@exemplo.com"/></label><label><Lock/> Senha *<div><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres"/><Eye/></div></label><button className="cz-primary" onClick={submit} disabled={busy}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar no CrewCheck' : 'Criar cadastro'} <span>→</span></button><button className="cz-secondary" onClick={demo}><Sparkles/> Ver modo demonstração</button><footer><a>Esqueci minha senha</a><a onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Criar conta' : 'Já tenho conta'}</a></footer></section><div className="cz-auth-footer"><ShieldCheck/> CREWCHECK V13.5.1 • PREMIUM BETA</div></main>;
}
function UserIcon(){return <span style={{display:'none'}}/>}
