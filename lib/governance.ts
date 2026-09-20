import {uid,now,normalizeWorkspace,type WorkspaceData,type Entry} from './model.ts';

export type GovernanceActor={email:string;name:string;role:string;governance?:boolean;mailConfigured?:boolean};
export const todayMaldives=(at=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export const emailAddress=(value:unknown)=>String(value||'').trim().toLowerCase();
const check=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)};
const required=(value:unknown,label:string,max=12000)=>{check(typeof value==='string'&&!!value.trim()&&value.length<=max,label+' is required and must be within '+max+' characters.');return String(value).trim()};
const validDate=(v:unknown,label:string)=>{const s=required(v,label,10);check(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Enter a valid '+label+'.');return s};
const cents=(v:unknown)=>{const n=Number(v);check(v!==''&&v!==undefined&&Number.isFinite(n)&&n>=0&&n<=10000000&&Math.abs(n*100-Math.round(n*100))<0.00001,'Enter a valid MVR amount with at most two decimals.');return Math.round(n*100)};
const find=(rows:Entry[],id:string)=>{const row=rows.find(x=>x.id===id);check(row,'Record not found.');return row!};
export function currentCommittee(d:WorkspaceData,day=todayMaldives()) {return d.committee.filter(c=>c.status==='Active'&&c.date&&c.date<=day&&c.end&&c.end>=day&&d.members.some(m=>m.id===c.memberId&&m.status==='Active'));}
export function excoSeat(d:WorkspaceData,a:GovernanceActor,day=todayMaldives()) {
 if(a.role==='General member'||a.role==='Disabled')return undefined;
 const link=d.accessLinks?.find(l=>l.status==='Active'&&l.email===emailAddress(a.email)&&l.role===a.role);
 return currentCommittee(d,day).find(c=>c.id===link?.committeeId);
}
export function governancePermissions(d:WorkspaceData,a:GovernanceActor) {
 const memberOnly=a.role==='General member',disabled=a.role==='Disabled';
 const owner=a.role==='System owner';const exco=!!excoSeat(d,a);
 const staff=d.accessLinks?.find(l=>l.status==='Active'&&l.email===emailAddress(a.email)&&l.role===a.role&&l.expires&&l.expires>=todayMaldives());
 return {exco,memberOnly,disabled,governance:owner||exco,dues:!memberOnly&&!disabled&&(owner||exco||!!staff?.dues),duesWrite:!memberOnly&&!disabled&&(owner||!!staff?.duesWrite||(exco&&['Treasurer','Secretary'].includes(excoSeat(d,a)!.title))),communications:owner||exco||(!memberOnly&&!disabled&&!!staff?.communications),admin:owner};
}
export function validateAccessLink(d:WorkspaceData,p:any,email:string) {
 const link:Entry={id:uid(),title:String(p.name||email),status:'Active',email,role:p.role};
 if(p.role==='General member'){
  const member=find(d.members,required(p.memberId,'Member profile'));
  check(member.status==='Active','Choose an active member.');check(emailAddress(member.email)===email,'The login must match the member’s confirmed email.');
  link.memberId=member.id;return link;
 }
 if(p.committeeId){
  check(!['Authorized staff','Disabled'].includes(p.role),'Use an ExCo role for an appointment; staff delegations do not confer an ExCo seat.');
  const seat=currentCommittee(d).find(c=>c.id===p.committeeId);check(seat,'Choose a current ExCo appointment linked to an active member.');
  check(!d.accessLinks.some(l=>l.status==='Active'&&l.email!==email&&l.committeeId===p.committeeId),'This ExCo seat already has a login. Remove its old assignment first.');
  check(!d.accessLinks.some(l=>l.status==='Active'&&l.email!==email&&l.memberId===seat!.memberId&&l.committeeId),'This person already has an ExCo login.');
  link.committeeId=seat!.id;link.memberId=seat!.memberId;
  link.reference=required(p.authorityRef,'Appointment and verified login reference');
 }
 check(p.role!=='ExCo member'||link.committeeId,'Link this login to its current ExCo appointment.');
 if(p.dues||p.duesWrite||p.communications){
  check(p.role==='Authorized staff','Choose Authorized staff for a scoped delegation.');
  link.expires=validDate(p.expires,'delegation expiry');check(link.expires>=todayMaldives(),'The delegation has expired.');
  link.reference=required(p.authorityRef,'Delegation reference');link.dues=!!p.dues||!!p.duesWrite;link.duesWrite=!!p.duesWrite;link.communications=!!p.communications;
 }
 return link;
}
export function duesSummary(d:WorkspaceData,member:Entry,day=todayMaldives()) {
 const account=d.duesAccounts?.find(x=>x.memberId===member.id);
 if(!account)return {configured:false,expected:0,paid:0,outstanding:0,credit:0,months:0,status:'Opening balance unconfirmed'};
 const start=account.startMonth as string;
 let end=day.slice(0,7);
 if(member.status==='Departed'&&member.departedAt)end=[end,String(member.departedAt).slice(0,7)].sort()[0];
 const monthIndex=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5,7));
 const months=Math.max(0,monthIndex(end)-monthIndex(start)+1);
 const expected=account.openingCents+months*5000;
 const paid=d.duesPayments.filter(p=>p.memberId===member.id&&p.status==='Recorded'&&p.date<=day).reduce((n,p)=>n+p.amountCents,0);
 const currentNotLate=end===day.slice(0,7)&&day.slice(8)<'05'&&months>0?5000:0;
 const overdue=Math.max(0,expected-paid-currentNotLate);
 return {configured:true,expected:expected/100,paid:paid/100,outstanding:Math.max(0,expected-paid)/100,overdue:overdue/100,credit:Math.max(0,paid-expected)/100,months,status:overdue>0?'Payment not recorded':expected>paid?'Due before the 5th':'Up to date'};
}
export function communicationPolicy(d:WorkspaceData){return d.governanceSettings?.find(x=>x.id==='communications-policy')}
export function eligibleReviewers(d:WorkspaceData) {
 return currentCommittee(d).map(seat=>{const link=d.accessLinks.find(l=>l.status==='Active'&&l.committeeId===seat.id&&l.role!=='General member'&&l.role!=='Disabled');return {seatId:seat.id,memberId:seat.memberId,name:seat.person,office:seat.title,email:link?.email||''}});
}
export function validApprovals(d:WorkspaceData,r:Entry) {
 const eligible=eligibleReviewers(d);
 return (r.approvals||[]).filter((x:any)=>x.version===r.version&&eligible.some(e=>e.seatId===x.seatId&&e.email===x.email));
}
export function communicationReady(d:WorkspaceData,r:Entry) {
 const policy=communicationPolicy(d);if(!policy||r.policyVersion!==policy.version)return false;
 const eligible=eligibleReviewers(d),approved=validApprovals(d,r);
 const threshold=policy.review==='all'?eligible.length:policy.review==='majority'?Math.floor(eligible.length/2)+1:2;
 return eligible.length>=2&&approved.length>=threshold&&approved.some((x:any)=>x.email!==r.author);
}
export function recipientSnapshot(d:WorkspaceData){return d.members.filter(m=>m.status==='Active').map(m=>({memberId:m.id,name:m.title,email:emailAddress(m.email)})).sort((a,b)=>a.memberId.localeCompare(b.memberId));}
export function recipientsUnchanged(d:WorkspaceData,r:Entry){return JSON.stringify(recipientSnapshot(d))===JSON.stringify(r.recipients)};
function record(d:WorkspaceData,a:GovernanceActor,r:Entry,action:string,privacy:'dues'|'exco'='exco') {
 const entry={id:uid(),at:now(),actor:emailAddress(a.email),action,detail:r.title,recordId:r.id,privacy};
 d.audit.unshift(entry);r.history=[...(r.history||[]),entry];
}
function queue(d:WorkspaceData,r:Entry,recipients:any[],kind:'decision'|'communication'|'review') {
 for(const recipient of recipients){
  check(recipient.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email),'Confirm every recipient email before sending.');
  d.mailOutbox.push({id:uid(),title:r.title,status:'Queued',kind,recordId:r.id,version:r.version,to:recipient.email,memberId:recipient.memberId,seatId:recipient.seatId,createdAt:now(),attempts:0});
 }
}
export function applyGovernanceCommand(d:WorkspaceData,c:any,a:GovernanceActor):{message:string;id?:string}|null {
 normalizeWorkspace(d);const p=governancePermissions(d,a);const type=c.type;
 if(type==='governance_policy'){
  check(p.admin,'Only the system owner may configure the review safeguard.');check(['two','majority','all'].includes(c.review),'Choose a review policy.');
  const reference=required(c.reason,'Policy decision reference');const old=communicationPolicy(d);
  const r:Entry={id:'communications-policy',title:'Member communication review',status:'Confirmed',review:c.review,reference,version:(old?.version||0)+1,history:old?.history||[]};
  d.governanceSettings=d.governanceSettings.filter(x=>x.id!==r.id);d.governanceSettings.push(r);record(d,a,r,'Communication safeguard configured');return {message:'Review safeguard saved. Existing drafts need fresh review.'};
 }
 if(type==='dues_account'){
  check(p.duesWrite,'Dues recording access is required.');const member=find(d.members,c.memberId);
  check(!d.duesAccounts.some(x=>x.memberId===member.id),'This opening balance is already recorded. Use a correction with evidence.');
  const start=required(c.startMonth,'First billing month',7);check(/^\d{4}-(0[1-9]|1[0-2])$/.test(start)&&start>=d.organization.registeredAt.slice(0,7),'Choose a valid month on or after registration.');
  const amount=cents(c.opening);const reference=required(c.reason,'Opening balance evidence / confirmation');
  check(c.confirm===true,'Confirm that prior dues and payments have been checked.');
  const r:Entry={id:uid(),title:member.title,status:'Active',memberId:member.id,startMonth:start,openingCents:amount,reference};
  d.duesAccounts.push(r);record(d,a,r,'Dues opening confirmed','dues');return {message:'Dues tracking started. Membership status is unchanged.'};
 }
 if(type==='dues_account_correct'){
  check(p.duesWrite,'Dues recording access is required.');const r=find(d.duesAccounts,c.id);const opening=cents(c.opening);const reason=required(c.reason,'Correction evidence and reason');check(c.confirm===true,'Confirm the corrected opening balance against prior receipts.');r.corrections=[...(r.corrections||[]),{openingCents:r.openingCents,reference:r.reference,at:now(),actor:a.email}];r.openingCents=opening;r.reference=reason;record(d,a,r,'Dues opening corrected','dues');return {message:'Opening corrected. Original values and payment allocations are retained.'};
 }
 if(type==='dues_payment'){
  check(p.duesWrite,'Dues recording access is required.');const member=find(d.members,c.memberId);const account=d.duesAccounts.find(x=>x.memberId===member.id);check(account,'Confirm the opening balance first.');
  const tx=find(d.transactions,c.transactionId);check(tx.type==='Income'&&tx.status==='Reconciled','Link a reconciled income transaction.');
  const amount=cents(c.amount);check(amount>0,'Payment must be greater than zero.');
  const allocated=d.duesPayments.filter(x=>x.transactionId===tx.id&&x.status==='Recorded').reduce((n,x)=>n+x.amountCents,0);
  check(allocated+amount<=Math.round(tx.amount*100),'Allocations cannot exceed the recorded income.');
  check(tx.date>=account!.startMonth+'-01'&&tx.date<=todayMaldives(),'Use a payment after the opening period and no later than today. Earlier payments belong in the confirmed opening balance.');
  const r:Entry={id:uid(),title:member.title,status:'Recorded',memberId:member.id,date:tx.date,amountCents:amount,transactionId:tx.id,reference:required(c.reason,'Receipt allocation reference')};
  d.duesPayments.push(r);record(d,a,r,'Dues payment allocated','dues');return {message:'Payment linked to existing income; no duplicate transaction was created.'};
 }
 if(type==='dues_reverse'){
  check(p.duesWrite,'Dues recording access is required.');const r=find(d.duesPayments,c.id);check(r.status==='Recorded','This allocation is already reversed.');
  r.reversalReason=required(c.reason,'Correction reason');r.status='Reversed';record(d,a,r,'Dues allocation reversed','dues');return {message:'Allocation reversed. The original payment and finance transaction are retained.'};
 }
 if(type==='dues_note'){
  check(p.dues,'Private dues access is required.');const r=find(d.duesAccounts,c.id);r.followUp=required(c.reason,'Private follow-up note');r.reviewDate=validDate(c.date,'review date');
  record(d,a,r,'Private dues follow-up recorded','dues');return {message:'Follow-up recorded for ExCo and authorized dues staff.'};
 }
 if(type==='decision_save'){
  check(p.governance,'ExCo access is required.');const old=c.id?find(d.decisions,c.id):undefined;check(!old||['Draft','Open','Awaiting formal decision'].includes(old.status),'Create a new proposal for a completed decision.');
  const title=required(c.title,'Matter',200),body=required(c.body,'Full explanation'),due=validDate(c.due,'response deadline');check(due>=todayMaldives(),'Choose a current or future response deadline.');
  const options=['ExCo consultation','General meeting required'];check(options.includes(c.kind),'Choose the decision route.');
  const fileIds=c.fileId?[required(c.fileId,'Evidence')]:[];fileIds.forEach(id=>check(d.files.some(f=>f.id===id&&['governance','exco','organization'].includes(f.scope)&&!f.projectId),'Use private governance evidence.'));
  const r:Entry={id:old?.id||uid(),title,body,due,kind:c.kind,fileIds,status:'Draft',author:emailAddress(a.email),version:(old?.version||0)+1,responses:[],history:old?.history||[],versions:[...(old?.versions||[]),...(old?[structuredClone({...old,versions:undefined})]:[])]};
  if(old)d.decisions[d.decisions.indexOf(old)]=r;else d.decisions.unshift(r);
  d.mailOutbox.filter(j=>j.recordId===r.id&&j.status==='Queued').forEach(j=>j.status='Cancelled');
  record(d,a,r,'Decision draft saved');return {message:'Draft saved. Earlier responses are retained in version history and do not apply to this wording.',id:r.id};
 }
 if(type==='decision_open'){
  check(p.governance,'ExCo access is required.');const r=find(d.decisions,c.id);check(r.status==='Draft','Only a draft can be opened.');
  const recipients=eligibleReviewers(d);check(recipients.length>=3&&recipients.every(x=>x.email),'Assign a verified login to every current ExCo member first.');
  check(r.due>=todayMaldives(),'Update the response deadline first.');
  if(c.email===true)check(a.mailConfigured&&d.mode==='live','Configure production email before emailing ExCo.');
  r.eligible=recipients;r.status='Open';r.openedAt=now();if(c.email===true)queue(d,r,recipients,'decision');record(d,a,r,'ExCo responses requested');return {message:c.email?'Request opened and emails queued.':'Request opened in the app. No email was requested.'};
 }
 if(type==='decision_respond'){
  const seat=excoSeat(d,a);check(seat,'Only a current, verified ExCo member can respond.');const r=find(d.decisions,c.id);
  check(r.status==='Open'&&r.due>=todayMaldives(),'This response window has closed.');check(c.version===r.version,'Read the latest wording before responding.');
  check(r.eligible.some((e:any)=>e.seatId===seat!.id&&e.email===emailAddress(a.email)),'This login is not in the recorded voter list.');
  check(['Agree','Disagree','Abstain','Conflict of interest'].includes(c.choice),'Choose a response.');
  const response={seatId:seat!.id,email:emailAddress(a.email),choice:c.choice,comment:String(c.comment||'').trim().slice(0,4000),version:r.version,at:now()};
  r.responseHistory=[...(r.responseHistory||[]),response];r.responses=[...r.responses.filter((x:any)=>x.seatId!==seat!.id),response];record(d,a,r,'ExCo response recorded');return {message:'Your response is recorded. Formal meeting decisions are recorded separately.'};
 }
 if(type==='decision_close'){
  check(p.governance,'ExCo access is required.');const r=find(d.decisions,c.id);check(r.status==='Open','This request is not open.');r.status='Awaiting formal decision';record(d,a,r,'Response window closed');return {message:'Responses retained. Record the formal outcome and signed minutes next.'};
 }
 if(type==='decision_finalize'){
  check(p.governance,'ExCo access is required.');const r=find(d.decisions,c.id);check(['Open','Awaiting formal decision'].includes(r.status),'Open the request first.');
  const meeting=find(d.meetings,c.meetingId);check(meeting.status==='Finalized'&&!meeting.importedAt,'Use a finalized meeting record with its actual approved minutes.');
  check(r.kind!=='General meeting required'||['General meeting','First general meeting','AGM'].includes(meeting.type),'This matter requires a general meeting.');
  check(['Executive committee','General meeting','First general meeting','AGM'].includes(meeting.type),'Choose an ExCo or general meeting.');
  check(meeting.date>=r.openedAt.slice(0,10),'The meeting must follow the proposal.');
  const general=meeting.type!=='Executive committee',eligible=Number(c.eligible);
  if(general)check(Number.isSafeInteger(eligible)&&eligible>0&&eligible>=d.members.filter(m=>m.status==='Active').length,'Confirm the complete eligible-member count, including members whose forms are still missing.');
  const minimum=general?Math.ceil(eligible*0.6):Math.ceil(currentCommittee(d).length/2);check(Number(meeting.quorum)>=minimum&&Number(meeting.present)>=Number(meeting.quorum)&&minimum>0,'The meeting must record the required quorum.');
  if(general)check(Number(meeting.present)<=eligible,'Attendance cannot exceed the confirmed eligible membership.');
  const proof=find(d.files,required(c.fileId,'Signed minutes / resolution'));check(['governance','exco','organization'].includes(proof.scope)&&!proof.projectId,'Use governance evidence.');
  check(c.confirm===true,'Confirm the meeting procedure, required votes and signatures.');
  r.outcome=required(c.outcome,'Exact adopted outcome');r.meetingId=meeting.id;r.eligibleAtMeeting=general?eligible:currentCommittee(d).length;r.resolutionFileId=proof.id;r.status='Recorded decision';r.finalizedAt=now();record(d,a,r,'Formal decision recorded');return {message:'Formal outcome retained with its meeting and signed evidence.'};
 }
 if(type==='communication_save'){
  check(p.communications,'Communication drafting access is required.');const old=c.id?find(d.communications,c.id):undefined;check(!old||old.status!=='Published','Published wording is retained. Create a new correction notice.');
  const policy=communicationPolicy(d);check(policy,'Confirm the member-email review safeguard in Settings first.');
  const title=required(c.title,'Subject',200);check(!/[\r\n]/.test(title),'Use a one-line subject.');const body=required(c.body,'Complete member-facing text');
  const r:Entry={id:old?.id||uid(),title,body,category:required(c.category,'Communication category',100),status:'Draft',author:emailAddress(a.email),version:(old?.version||0)+1,policyVersion:policy!.version,recipients:recipientSnapshot(d),approvals:[],history:old?.history||[],versions:[...(old?.versions||[]),...(old?[structuredClone({...old,versions:undefined})]:[])]};
  if(old)d.communications[d.communications.indexOf(old)]=r;else d.communications.unshift(r);record(d,a,r,'Member communication drafted');return {message:'Exact wording and recipients saved for ExCo review. Nothing was published or emailed.',id:r.id};
 }
 if(type==='communication_review'){
  const seat=excoSeat(d,a);check(seat,'Only a verified current ExCo member can review member communications.');const r=find(d.communications,c.id);
  check(r.status!=='Published','This communication is already published.');check(c.version===r.version,'Read the latest version before reviewing.');check(r.policyVersion===communicationPolicy(d)?.version&&recipientsUnchanged(d,r),'Policy or recipients changed. Save a fresh draft before reviewing.');
  check(c.confirm===true,'Check the complete text and recipient list before approving.');
  if(c.approve===true){check(r.status!=='Changes requested','Save a corrected draft before approving again.');check(!r.approvals.some((x:any)=>x.seatId===seat!.id),'Your review is already recorded.');r.approvals.push({seatId:seat!.id,email:emailAddress(a.email),version:r.version,at:now()});r.status=communicationReady(d,r)?'Approved':'Awaiting review';}
  else {r.approvals=[];r.status='Changes requested';r.reviewNote=required(c.reason,'Required correction');}
  record(d,a,r,c.approve?'Member wording approved':'Member wording returned');return {message:c.approve?'Review recorded for this wording and recipient list.':'Changes requested; earlier approvals cleared.'};
 }
 if(type==='communication_request_review'){
  check(p.communications,'Communication drafting access is required.');const r=find(d.communications,c.id);
  check(['Draft','Awaiting review'].includes(r.status),'Save a draft that still needs review.');
  check(c.version===r.version&&r.policyVersion===communicationPolicy(d)?.version&&recipientsUnchanged(d,r),'Refresh the draft before requesting review.');
  check(c.confirm===true&&a.mailConfigured&&d.mode==='live','Confirm the ExCo review request and configure production email first.');
  const recipients=eligibleReviewers(d);check(recipients.length>=2&&recipients.every(x=>x.email),'Assign a verified login to every current ExCo member first.');
  check(!d.mailOutbox.some(j=>j.kind==='review'&&j.recordId===r.id&&j.version===r.version),'Review emails have already been requested for this version. Check their delivery records.');
  queue(d,r,recipients,'review');r.status='Awaiting review';record(d,a,r,'ExCo editorial review requested');return {message:'Full draft queued for ExCo review only. General members receive nothing.'};
 }
 if(type==='communication_publish'){
  check(p.exco,'A current ExCo member must release the final member communication.');const r=find(d.communications,c.id);
  check(r.status!=='Published','This version is already published.');check(c.version===r.version&&communicationReady(d,r)&&recipientsUnchanged(d,r),'Fresh ExCo review is required for the current wording, policy and recipients.');
  check(c.confirm===true,'Confirm the final member-facing text and recipients.');check(a.mailConfigured&&d.mode==='live','Configure production email before publishing and emailing members.');
  check(r.recipients.length>0&&r.recipients.every((x:any)=>x.email),'Confirm every active member’s email before sending.');
  check(new Set(r.recipients.map((x:any)=>x.email)).size===r.recipients.length,'Resolve shared or duplicate member email addresses before sending.');
  r.status='Published';r.publishedAt=now();r.publishedBy=emailAddress(a.email);queue(d,r,r.recipients,'communication');record(d,a,r,'Member communication released');return {message:'Approved update published to its recipients and queued for individual email delivery.'};
 }
 return null;
}

export function publicMemberUpdates(d:WorkspaceData,email:string){return (d.communications||[]).filter(r=>r.status==='Published'&&r.recipients.some((x:any)=>x.email===emailAddress(email))).map(r=>({id:r.id,title:r.title,status:'Published',body:r.body,category:r.category,publishedAt:r.publishedAt}));}
