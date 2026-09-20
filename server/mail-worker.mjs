import {membership,workspace,saveWorkspace} from './records.mjs';
import {mailConfigured} from './mail-config.mjs';
import {normalizeWorkspace} from '../lib/model.ts';
import {communicationReady,communicationPolicy,recipientsUnchanged,eligibleReviewers,todayMaldives,emailAddress} from '../lib/governance.ts';

export function emailJobAllowed(data,job){
 if(data.mode!=='live')return false;
 const record=(job.kind==='decision'?data.decisions:data.communications).find(r=>r.id===job.recordId&&r.version===job.version);
 if(!record)return false;
 if(job.kind==='decision')return record.status==='Open'&&record.due>=todayMaldives()&&eligibleReviewers(data).some(e=>e.seatId===job.seatId&&e.email===job.to);
 if(job.kind==='review')return ['Draft','Awaiting review'].includes(record.status)&&record.policyVersion===communicationPolicy(data)?.version&&recipientsUnchanged(data,record)&&eligibleReviewers(data).some(e=>e.seatId===job.seatId&&e.email===job.to);
 return record.status==='Published'&&communicationReady(data,record)&&record.recipients.some(r=>r.memberId===job.memberId&&r.email===job.to)&&data.members.some(m=>m.id===job.memberId&&m.status==='Active'&&emailAddress(m.email)===job.to);
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function emailPayload(data,job,config){
 const record=(job.kind==='decision'?data.decisions:data.communications).find(r=>r.id===job.recordId);
 const decision=job.kind==='decision',review=job.kind==='review';
 const link=config.origin+'/open?kind='+(decision?'decisions':'communications')+'&id='+encodeURIComponent(record.id);
 const heading=decision?'ExCo response requested':review?'Private ExCo review · draft only':'Member update';
 const detail=decision?'Respond by '+record.due+' (Maldives).\nChoose Agree, Disagree, Abstain, or Conflict of interest.\nYour response supports the discussion; any required formal resolution is recorded separately.':review?'Review the complete draft above and the recipient list in the app. Check the facts, wording and intended audience, then approve or request a correction. Nothing has been released to general members.':'';
 const text=[heading,record.title,record.body,detail,'Open securely: '+link,'Atoll Commons Operations'].filter(Boolean).join('\n\n');
 return {from:'Atoll Commons <'+config.from+'>',to:[job.to],reply_to:config.replyTo,subject:(decision?'Action requested: ':review?'Private review requested: ':'')+record.title,text,html:'<!doctype html><html><body style="margin:0;background:#f3f6f5;font-family:Arial,sans-serif;color:#15332f"><main style="max-width:600px;margin:24px auto;padding:32px;background:#fff;border-radius:12px"><p style="color:#53736e">Atoll Commons · '+heading+'</p><h1 style="font-size:24px">'+escape(record.title)+'</h1><div dir="auto" style="white-space:pre-wrap;font-size:17px;line-height:1.65">'+escape(record.body)+'</div><p style="white-space:pre-wrap;line-height:1.5">'+escape(detail)+'</p><p style="margin:30px 0"><a href="'+escape(link)+'" style="display:inline-block;padding:15px 23px;border-radius:8px;background:#14685d;color:#fff;text-decoration:none">'+(decision?'Read and respond':review?'Review draft in the app':'Open member update')+'</a></p><p style="font-size:13px;color:#53736e">Use your assigned email to sign in. Reply to this email if you need help.</p></main></body></html>'};
}
// Each external send follows a persisted CAS claim. Retries reuse both payload and key.
export async function deliverOne(workspaceId,{load=workspace,save=saveWorkspace,send=fetch,config={origin:process.env.APP_URL,from:process.env.MAIL_FROM,replyTo:process.env.MAIL_REPLY_TO,key:process.env.RESEND_API_KEY}}={}){
 const row=await load(workspaceId);if(!row)return false;
 const data=normalizeWorkspace(JSON.parse(row.data));if(data.mode!=='live')return false;
 const job=data.mailOutbox.find(j=>(j.status==='Queued'||j.status==='Sending'&&Date.parse(j.leaseUntil||'')<Date.now())&&(!j.nextAttempt||Date.parse(j.nextAttempt)<=Date.now()));
 if(!job)return false;
 if(!emailJobAllowed(data,job)){job.status='Cancelled';job.note='Recipient access, approval or request changed.';await save(workspaceId,row.revision,data);return true;}
 if(job.firstAttempt&&Date.now()-Date.parse(job.firstAttempt)>23*3600000||job.attempts>=3){job.status='Needs attention';job.note='Delivery could not be confirmed. Check the provider before sending a new notice.';await save(workspaceId,row.revision,data);return true;}
 const token=crypto.randomUUID();job.status='Sending';job.claim=token;job.leaseUntil=new Date(Date.now()+120000).toISOString();job.firstAttempt||=new Date().toISOString();job.attempts++;
 job.payload||=emailPayload(data,job,config);job.idempotencyKey||='atoll-'+workspaceId+'-'+job.id;
 if(!await save(workspaceId,row.revision,data))return true;
 let providerId,error;
 try{
  const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json','Idempotency-Key':job.idempotencyKey},body:JSON.stringify(job.payload),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok||!result.id)throw new Error('Provider did not confirm acceptance.');providerId=result.id;
 }catch{error=true;}
 // Preserve edits made while the provider request was in flight.
 for(let attempt=0;attempt<8;attempt++){
  const fresh=await load(workspaceId);const next=normalizeWorkspace(JSON.parse(fresh.data));const target=next.mailOutbox.find(j=>j.id===job.id);
  if(!target||target.claim!==token)return true;
  target.status=error?'Queued':'Sent';target.providerId=providerId||null;target.sentAt=providerId?new Date().toISOString():null;target.nextAttempt=error?new Date(Date.now()+60000).toISOString():null;
  target.note=error?'Provider acceptance is unconfirmed; retry uses the same delivery key.':'Accepted by the email provider. Inbox delivery is not yet confirmed.';
  if(await save(workspaceId,fresh.revision,next))return true;
 }
 return true;
}
export function startMailWorker(){
 if(!mailConfigured())return;
 const config={origin:new URL(process.env.APP_URL).origin,from:process.env.MAIL_FROM,replyTo:process.env.MAIL_REPLY_TO,key:process.env.RESEND_API_KEY};
 let working=false;
 const tick=async()=>{if(working)return;working=true;try{const access=await membership(process.env.OWNER_EMAIL.toLowerCase());if(access)for(let i=0;i<20;i++){if(!await deliverOne(access.workspace_id,{config}))break;}}catch{console.error('Mail queue check failed; saved jobs remain available for retry.');}finally{working=false;}};
 const timer=setInterval(tick,15000);timer.unref();void tick();
}
