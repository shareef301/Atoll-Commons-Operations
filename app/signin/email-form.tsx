'use client';
import {useState} from 'react';
export function EmailSignIn() {
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <form className="signin-email" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try {const response=await fetch('/auth/email',{method:'POST',body:new FormData(event.currentTarget)});const result=await response.json();if(!response.ok)throw new Error(result.error);setMessage(result.message);}
    catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}
  }}>
    <label htmlFor="signin-email">Email address</label>
    <input id="signin-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@atollcommons.org" disabled={busy}/>
    <button className="button primary" type="submit" disabled={busy}>{busy?'Sending…':'Email me a sign-in link'}</button>
    {message&&<p role="status" className="metadata">{message}</p>}
    {error&&<p role="alert" className="form-error">{error}</p>}
  </form>;
}
