import test from 'node:test';
import assert from 'node:assert/strict';
import {seedData,normalizeWorkspace,type Entry} from '../lib/model.ts';
import {applyCommand,type Actor} from '../lib/domain.ts';
import {duesSummary,governancePermissions,communicationReady,todayMaldives,validateAccessLink} from '../lib/governance.ts';
import {projectWorkspace,fileAccess,type AccessSession} from '../lib/access.ts';
import {emailPayload,emailJobAllowed,deliverOne} from '../server/mail-worker.mjs';

const owner:Actor={name:'Administrator',email:'owner@example.test',role:'System owner',governance:false,projects:[],mailConfigured:true};
function fixture(){const d=seedData();d.mode='live';d.members=Array.from({length:6},(_,i)=>({id:'member'+i,title:'Person '+i,status:'Active',email:'person'+i+'@example.test',nationalId:'PRIVATE ID '+i,reviewNotes:'PRIVATE review'}));d.committee=d.members.slice(0,5).map((m,i)=>({id:'seat'+i,title:['President','Vice President','Treasurer','Secretary','Independent member'][i],person:m.title,memberId:m.id,status:'Active',date:'2026-01-01',end:'2099-12-31'}));d.accessLinks=d.committee.map((s,i)=>({id:'link'+i,title:s.person,status:'Active',role:'ExCo member',committeeId:s.id,memberId:s.memberId,email:d.members[i].email}));return d;}
const exco=(i:number):Actor=>({...owner,email:'person'+i+'@example.test',name:'Person '+i,role:'ExCo member'});
function session(d:ReturnType<typeof fixture>,a:Actor):AccessSession{return {data:d,revision:1,access:{name:a.name,email:a.email,role:a.role,governance:1,projects:'["ac-01","rep1"]'},user:{email:a.email,displayName:a.name},members:[]};}
const policy=(d:ReturnType<typeof fixture>)=>applyCommand(d,{type:'governance_policy',review:'two',reason:'Test operational review approval'},owner);
function draft(d:ReturnType<typeof fixture>){policy(d);const {id}=applyCommand(d,{type:'communication_save',title:'General meeting notice',body:'The full reviewed meeting notice. No private details.',category:'Meeting notice & agenda'},exco(0));return d.communications.find(r=>r.id===id)!;}
function approve(d:ReturnType<typeof fixture>,r:Entry,i:number){return applyCommand(d,{type:'communication_review',id:r.id,version:r.version,approve:true,confirm:true},exco(i));}

test('old workspaces normalize without seeding fabricated dues or approvals',()=>{const d=seedData();delete (d as any).duesAccounts;delete (d as any).communications;normalizeWorkspace(d);assert.deepEqual(d.duesAccounts,[]);assert.deepEqual(d.communications,[]);assert.equal(duesSummary(d,d.members[0]).configured,false)});
test('dues use Maldives day boundary, allow partial payment and never remove membership',()=>{
 const d=fixture(),m=d.members[5];applyCommand(d,{type:'dues_account',memberId:m.id,startMonth:'2026-09',opening:0,confirm:true,reason:'Confirmed zero prior balance'},owner);
 assert.equal(duesSummary(d,m,'2026-09-04').overdue,0);assert.equal(duesSummary(d,m,'2026-09-05').overdue,50);
 d.transactions.push({id:'receipt',title:'Membership receipt',status:'Reconciled',type:'Income',date:'2026-09-03',amount:50});
 applyCommand(d,{type:'dues_payment',memberId:m.id,transactionId:'receipt',amount:25,reason:'Partial September allocation'},exco(2));
 assert.equal(duesSummary(d,m,'2026-09-05').overdue,25);assert.equal(m.status,'Active');assert.equal(d.transactions.filter(t=>t.id==='receipt').length,1);
 assert.throws(()=>applyCommand(d,{type:'dues_payment',memberId:m.id,transactionId:'receipt',amount:30,reason:'Overallocate'},owner),/exceed/);
 assert.equal(todayMaldives(new Date('2026-09-04T19:00:00Z')),'2026-09-05');
 const payment=d.duesPayments[0];applyCommand(d,{type:'dues_reverse',id:payment.id,reason:'Receipt allocated to wrong member'},owner);assert.equal(duesSummary(d,m,'2026-09-05').overdue,50);assert.equal(payment.status,'Reversed');
});
test('general members cannot obtain private JSON, files, reports, notes, or future fields',()=>{
 const d=fixture(),a={...exco(5),role:'General member'};const r=draft(d);approve(d,r,0);approve(d,r,1);applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},exco(0));
 d.duesAccounts.push({id:'secret',title:'PRIVATE arrears',status:'Active'});d.files.push({id:'private',title:'PRIVATE bank.pdf',status:'Retained',scope:'dues'});d.organization.notes='PRIVATE notes';(d as any).futureSensitiveObject={secret:'PRIVATE future'};
 const result=projectWorkspace(session(d,a));const body=JSON.stringify(result);
 assert.doesNotMatch(body,/PRIVATE|nationalId|reviewNotes|futureSensitiveObject|source-snapshot|person0@example/);
 assert.equal(result.data.communications.length,1);assert.deepEqual(result.data.reports,[]);assert.deepEqual(result.data.members,[]);assert.deepEqual(result.data.mailOutbox,[]);
 for(const file of d.files)assert.equal(fileAccess(session(d,a),file),false);
 assert.throws(()=>applyCommand(d,{type:'decision_save'},a),/only read/);
});
test('private dues cannot leak through legacy compliance permissions; staff delegation expires',()=>{
 const d=fixture();d.files.push({id:'private',title:'Private dues.pdf',status:'Retained',scope:'dues'});d.duesAccounts.push({id:'a',title:'Private balance',status:'Active'});
 const a={...owner,role:'Compliance secretary'};assert.equal(projectWorkspace(session(d,a)).data.duesAccounts.length,0);assert.equal(projectWorkspace(session(d,a)).data.files.some(f=>f.id==='private'),false);
 const staff={...owner,role:'Authorized staff'};d.accessLinks.push({id:'staff',title:'Scoped staff',status:'Active',email:staff.email,role:staff.role,dues:true,expires:'2099-01-01'});
 assert.equal(governancePermissions(d,staff).dues,true);assert.equal(governancePermissions(d,staff).governance,false);d.accessLinks.at(-1)!.expires='2026-01-01';assert.equal(governancePermissions(d,staff).dues,false);
});
test('an ExCo title or governance flag alone cannot vote; expired terms lose access',()=>{
 const d=fixture();assert.equal(governancePermissions(d,{...exco(5),governance:true}).exco,false);
 assert.equal(governancePermissions(d,exco(0)).dues,true);d.committee[0].end='2026-01-01';assert.equal(governancePermissions(d,exco(0)).exco,false);assert.equal(governancePermissions(d,exco(0)).dues,false);
 assert.throws(()=>validateAccessLink(d,{role:'ExCo member',committeeId:'seat1',authorityRef:'Verified appointment'},'another@example.test'),/already has/);
 assert.throws(()=>validateAccessLink(d,{role:'General member',memberId:'member5'},'wrong@example.test'),/match/);
 assert.throws(()=>validateAccessLink(d,{role:'Authorized staff',committeeId:'seat1'},'staff@example.test'),/ExCo role/);
});
test('new committee appointments bind to an active member and retain that identity',()=>{
 const d=fixture();const result=applyCommand(d,{type:'create',collection:'committee',values:{title:'Secretary',memberId:'member5',date:todayMaldives(),end:'2099-01-01',eventType:'Later change'}},owner);
 const seat=d.committee.find(c=>c.id===result.id)!;assert.equal(seat.memberId,'member5');assert.equal(seat.person,'Person 5');
 d.members[5].status='Departed';assert.throws(()=>applyCommand(d,{type:'create',collection:'committee',values:{title:'Secretary',memberId:'member5',date:todayMaldives(),end:'2099-01-01',eventType:'Later change'}},owner),/active member/);
});
test('online responses use session identity, retain changes and cannot become a formal resolution automatically',()=>{
 const d=fixture();const {id}=applyCommand(d,{type:'decision_save',title:'Programme plan',body:'Full context for the programme plan.',kind:'ExCo consultation',due:'2099-01-01'},owner);const r=d.decisions.find(r=>r.id===id)!;
 applyCommand(d,{type:'decision_open',id},owner);
 assert.throws(()=>applyCommand(d,{type:'decision_respond',id,version:1,choice:'Agree'},owner),/verified ExCo/);
 applyCommand(d,{type:'decision_respond',id,version:1,choice:'Agree',email:exco(4).email},exco(0));
 applyCommand(d,{type:'decision_respond',id,version:1,choice:'Disagree'},exco(0));assert.equal(r.responses.length,1);assert.equal(r.responses[0].email,exco(0).email);assert.equal(r.responseHistory.length,2);assert.equal(r.status,'Open');
 applyCommand(d,{type:'decision_save',id,title:r.title,body:'Changed full context.',kind:r.kind,due:r.due},owner);const latest=d.decisions.find(r=>r.id===id)!;assert.equal(latest.version,2);assert.equal(latest.responses.length,0);assert.equal(latest.versions[0].responses[0].choice,'Disagree');
 assert.throws(()=>applyCommand(d,{type:'decision_finalize',id,confirm:true},owner),/Open/);
});
test('communications require distinct reviews, exact version, stable recipients and explicit final release',()=>{
 const d=fixture(),r=draft(d);approve(d,r,0);assert.equal(communicationReady(d,r),false);assert.throws(()=>approve(d,r,0),/already/);
 assert.throws(()=>applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},exco(0)),/Fresh ExCo/);
 approve(d,r,1);assert.equal(communicationReady(d,r),true);assert.equal(d.mailOutbox.length,0);
 d.members[5].email='changed@example.test';assert.throws(()=>applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},exco(0)),/Fresh ExCo/);
 d.members[5].email='person5@example.test';assert.throws(()=>applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},{...exco(0),mailConfigured:false}),/Configure/);
 applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},exco(0));assert.equal(d.mailOutbox.length,6);assert.equal(r.status,'Published');assert.throws(()=>applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},exco(0)),/already/);
});
test('changed wording, expired review authority, and policy changes invalidate approvals',()=>{
 const d=fixture(),r=draft(d);approve(d,r,0);approve(d,r,1);d.committee[1].end='2026-01-01';assert.equal(communicationReady(d,r),false);d.committee[1].end='2099-01-01';
 applyCommand(d,{type:'communication_save',id:r.id,title:r.title,body:'Revised public wording',category:r.category},exco(0));const latest=d.communications[0];assert.equal(latest.approvals.length,0);assert.throws(()=>applyCommand(d,{type:'communication_review',id:latest.id,version:1,approve:true,confirm:true},exco(1)),/latest/);
 approve(d,latest,0);approve(d,latest,1);policy(d);assert.equal(communicationReady(d,latest),false);
});
test('a requested correction blocks further approval until a new draft is saved',()=>{
 const d=fixture(),r=draft(d);approve(d,r,0);
 applyCommand(d,{type:'communication_review',id:r.id,version:r.version,approve:false,confirm:true,reason:'Correct the meeting date.'},exco(1));
 assert.equal(r.approvals.length,0);assert.throws(()=>approve(d,r,2),/corrected draft/);
 applyCommand(d,{type:'communication_save',id:r.id,title:r.title,body:'Notice with the corrected meeting date.',category:r.category},exco(0));
 approve(d,d.communications[0],1);assert.equal(d.communications[0].approvals.length,1);
});
test('review request emails address only ExCo and are invalidated by a correction',()=>{
 const d=fixture(),r=draft(d);
 applyCommand(d,{type:'communication_request_review',id:r.id,version:r.version,confirm:true},owner);
 assert.equal(d.mailOutbox.length,5);assert.ok(d.mailOutbox.every(j=>j.kind==='review'&&j.to!=='person5@example.test'));assert.equal(r.status,'Awaiting review');
 assert.throws(()=>applyCommand(d,{type:'communication_request_review',id:r.id,version:r.version,confirm:true},owner),/already/);
 const job=d.mailOutbox[0];assert.equal(emailJobAllowed(d,job),true);
 const payload=emailPayload(d,job,{origin:'https://ops.example.test',from:'hello@example.test',replyTo:'hello@example.test'});assert.match(payload.subject,/Private review/);assert.match(payload.text,/Nothing has been released/);
 applyCommand(d,{type:'communication_review',id:r.id,version:r.version,approve:false,confirm:true,reason:'Correct the date first.'},exco(1));assert.equal(emailJobAllowed(d,job),false);
});
test('general-meeting outcomes require a confirmed census and the corresponding quorum',()=>{
 const d=fixture();const {id}=applyCommand(d,{type:'decision_save',title:'General meeting matter',body:'A matter reserved to the membership.',kind:'General meeting required',due:'2099-01-01'},owner);applyCommand(d,{type:'decision_open',id},owner);
 d.meetings.push({id:'formal',title:'General meeting',type:'General meeting',date:todayMaldives(),status:'Finalized',present:8,quorum:8});d.files.push({id:'minutes',title:'Signed minutes',status:'Retained',scope:'governance'});
 const command={type:'decision_finalize',id,meetingId:'formal',fileId:'minutes',outcome:'Recorded adopted outcome',confirm:true};
 assert.throws(()=>applyCommand(d,command,owner),/eligible-member count/);assert.throws(()=>applyCommand(d,{...command,eligible:15},owner),/quorum/);
 d.meetings.at(-1)!.quorum=9;d.meetings.at(-1)!.present=9;applyCommand(d,{...command,eligible:15},owner);assert.equal(d.decisions[0].eligibleAtMeeting,15);
});
test('email content escapes HTML, includes only one recipient and blocks revoked recipients',()=>{
 const d=fixture(),r=draft(d);r.body='<script>unsafe</script>';approve(d,r,0);approve(d,r,1);applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},exco(0));const job=d.mailOutbox[5];
 const payload=emailPayload(d,job,{origin:'https://ops.example.test',from:'hello@example.test',replyTo:'hello@example.test'});assert.deepEqual(payload.to,['person5@example.test']);assert.doesNotMatch(payload.html,/<script>/);assert.match(payload.html,/&lt;script&gt;/);assert.doesNotMatch(JSON.stringify(payload),/PRIVATE ID|PRIVATE review/);
 assert.equal(emailJobAllowed(d,job),true);d.members[5].status='Departed';assert.equal(emailJobAllowed(d,job),false);
});
test('mail workers claim atomically, retry one stable payload and never resend after the provider key expires',async()=>{
 const d=fixture(),r=draft(d);approve(d,r,0);approve(d,r,1);applyCommand(d,{type:'communication_publish',id:r.id,version:r.version,confirm:true},exco(0));d.mailOutbox=d.mailOutbox.slice(0,1);
 let row={revision:1,data:JSON.stringify(d)};const load=async()=>structuredClone(row);const save=async(_id:string,revision:number,next:any)=>{if(revision!==row.revision)return false;row={revision:revision+1,data:JSON.stringify(next)};return true;};
 let calls:any[]=[];const send=async(_url:any,options:any)=>{calls.push(options);throw new Error('Uncertain network result')};const config={origin:'https://ops.example.test',from:'hello@example.test',replyTo:'hello@example.test',key:'test-key'};
 await Promise.all([deliverOne('test',{load,save,send,config}),deliverOne('test',{load,save,send,config})]);assert.equal(calls.length,1);
 let state=JSON.parse(row.data);state.mailOutbox[0].nextAttempt=null;row.data=JSON.stringify(state);
 await deliverOne('test',{load,save,config,send:async(_url:any,options:any)=>{calls.push(options);return Response.json({id:'provider-id'});}});
 assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(JSON.parse(row.data).mailOutbox[0].status,'Sent');
 state=JSON.parse(row.data);state.mailOutbox[0].status='Queued';state.mailOutbox[0].firstAttempt='2026-01-01T00:00:00Z';row.data=JSON.stringify(state);await deliverOne('test',{load,save,send,config});assert.equal(calls.length,2);assert.equal(JSON.parse(row.data).mailOutbox[0].status,'Needs attention');
});
