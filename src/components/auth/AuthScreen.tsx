import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { BookOpen, LockKeyhole, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import '@lovable.dev/cloud-auth-js/styles.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login'|'signup'|'forgot'>('login');
  const [email,setEmail] = useState(''); const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      if(mode === 'forgot') {
        const {error} = await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/reset-password'});
        if(error) throw error; setMessage('Check your email for a password reset link.');
      } else if(mode === 'signup') {
        const {data,error} = await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/auth'}});
        if(error) throw error;
        if(data.session) await navigate({to:'/'}); else setMessage('Check your email to confirm your account before signing in.');
      } else {
        const {error} = await supabase.auth.signInWithPassword({email,password});
        if(error) throw error; await navigate({to:'/'});
      }
    } catch(e) {setMessage(e instanceof Error?e.message:'Unable to sign in. Please try again.');} finally {setBusy(false);}
  }
  async function oneClick() {
    setBusy(true);setMessage('');
    const {error} = await supabase.auth.signInAnonymously();
    if(error) {setMessage(error.message);setBusy(false);return;}
    await navigate({to:'/'});
  }
  async function social(provider:'google'|'lovable') {
    setBusy(true);setMessage('');
    const result = await lovable.auth.signInWithOAuth(provider,{redirect_uri:window.location.origin+'/auth'});
    if(result.error) {setMessage(result.error.message);setBusy(false);return;}
    if(!result.redirected) await navigate({to:'/'}); setBusy(false);
  }
  return <main className="grid min-h-screen place-items-center bg-background p-6">
    <div className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3"><span className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground"><BookOpen /></span><div><p className="text-xs font-semibold text-muted-foreground">TURNKEY PUBLISHERS</p><h1 className="text-3xl font-extrabold text-navy">MFAHH</h1></div></div>
      <h2 className="mb-6 text-xl font-bold">{mode==='login'?'Sign in':mode==='signup'?'Create an account':'Reset your password'}</h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div>
        {mode!=='forgot'&&<div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" required minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} /></div>}
        {message&&<p role="status" className="text-sm text-primary">{message}</p>}
        <Button className="w-full" disabled={busy} type="submit">{mode==='forgot'?<Mail/>:<LockKeyhole/>}{busy?'Please wait…':mode==='signup'?'Create account':mode==='forgot'?'Send reset link':'Sign in'}</Button>
      </form>
      {mode!=='forgot'&&<div className="mt-4 space-y-3"><Button variant="secondary" className="w-full" disabled={busy} onClick={oneClick}>Sign in with one click</Button><Button variant="outline" className="w-full" disabled={busy} onClick={()=>social('google')}>Continue with Google</Button><Button className="lovable-auth-button w-full" disabled={busy} onClick={()=>social('lovable')}>Continue with Lovable</Button></div>}
      <div className="mt-4 flex flex-wrap justify-between gap-2"><Button variant="link" size="sm" onClick={()=>{setMode(mode==='signup'?'login':'signup');setMessage('');}}>{mode==='signup'?'Already have an account? Sign in':'Create account'}</Button><Button variant="link" size="sm" onClick={()=>{setMode(mode==='forgot'?'login':'forgot');setMessage('');}}>{mode==='forgot'?'Back to sign in':'Forgot password?'}</Button></div>
      <p className="mt-8 text-center text-xs text-muted-foreground">Knowledge Today, A Brighter Tomorrow</p>
    </div>
  </main>;
}
