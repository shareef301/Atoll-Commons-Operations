import test from 'node:test';
import assert from 'node:assert/strict';
import {seedData,addMonths} from '../lib/model.ts';
import {applyCommand,type Actor} from '../lib/domain.ts';

const owner:Actor={name:'Owner',email:'owner@example.test',role:'System owner',governance:false,projects:[]};
const actor=(role:string)=>({...owner,role});
const proof={id:'proof',title:'Signed source.pdf',status:'Retained',scope:'governance',projectId:''};

test('governance attachments append to finalized records without rewriting the decision',()=>{
 const d=seedData();d.files.push(proof);const m=d.meetings[0];m.status='Finalized';m.minutes='Approved original';m.fileIds=['earlier'];
 const c={type:'attach_evidence',collection:'meetings',id:m.id,fileId:proof.id,reason:'Corrected scan; original retained'};
 assert.throws(()=>applyCommand(d,c,actor('Project lead')),/access/);
 applyCommand(d,c,owner);applyCommand(d,c,owner);
 assert.deepEqual(m.fileIds,['earlier','proof']);assert.equal(m.minutes,'Approved original');assert.equal(m.status,'Finalized');
 d.files[0].projectId='ac-01';assert.throws(()=>applyCommand(d,c,owner),/governance or compliance/);
});

test('member corrections retain previous values, source evidence and lifecycle',()=>{
 const d=seedData();const m=d.members[0];m.reviewNotes='Date needs checking';m.fileIds=['original'];
 const c={type:'member_details',id:m.id,values:{title:'Corrected member',email:'member@example.test',applicationDate:'2026-09-01',reason:'Corrected signed form received',reviewNotes:''}};
 assert.throws(()=>applyCommand(d,c,actor('Treasurer')),/access/);
 const before=m.title;applyCommand(d,c,owner);
 assert.equal(m.detailChanges[0].previous.title,before);assert.equal(m.status,'Active');assert.deepEqual(m.fileIds,['original']);assert.equal(m.reviewNotes,'');
 assert.throws(()=>applyCommand(d,{...c,values:{...c.values,applicationDate:'2999-01-01'}},owner),/future/);
 assert.equal(m.applicationDate,'2026-09-01');
});

test('internal completion requires completed prerequisites and cannot close an official filing',()=>{
 const d=seedData();d.files.push(proof);const o=d.obligations[1];
 const c={type:'complete_internal',id:o.id,fileId:proof.id,reason:'Source gaps resolved'};
 assert.throws(()=>applyCommand(d,c,owner),/Official duties/);o.authority='Internal governance';
 assert.throws(()=>applyCommand(d,c,owner),/checklist/);o.checklist.forEach((x:any)=>x.done=true);
 applyCommand(d,c,owner);assert.equal(o.status,'Closed');assert.deepEqual(o.fileIds,['proof']);assert.ok(o.completedAt);
 assert.throws(()=>applyCommand(d,c,owner),/already complete/);
});

test('confirming a triggered deadline clears the pending date label and retains the earlier date',()=>{
 const d=seedData();const o=d.obligations[2];o.due='';o.dueLabel='30 days after approval';
 applyCommand(d,{type:'deadline_decision',id:o.id,due:'2027-03-12',reason:'Approval dated 10 February; source reviewed'},owner);
 assert.equal(o.due,'2027-03-12');assert.equal(o.dueLabel,undefined);assert.equal(o.deadlineHistory[0].due,'');
});

test('live projects without a verified threshold create a source review instead of an invented legal deadline',()=>{
 const d=seedData();d.mode='live';const rule=d.rules.find(r=>r.id==='r2')!;delete rule.threshold;
 const result=applyCommand(d,{type:'create',collection:'projects',values:{title:'First real project',description:'Approved scope to develop',start:'2027-01-01',due:'2027-02-01',budget:30000,owner:'lead@example.test',sponsor:'sponsor@example.test',backup:'deputy@example.test'}},owner);
 const duties=d.obligations.filter(o=>o.projectId===result.id);assert.equal(duties.length,1);assert.equal(duties[0].authority,'Internal governance');assert.equal(duties[0].due,'');
});

test('later live appointments do not invent a notification interval absent from the source',()=>{
 const d=seedData();d.mode='live';delete d.rules.find(r=>r.id==='r3')!.changeDays;
 const result=applyCommand(d,{type:'create',collection:'committee',values:{title:'Secretary',person:'Member',date:'2027-01-01',end:'2029-09-16',eventType:'Later change'}},owner);
 const duty=d.obligations.find(o=>o.committeeId===result.id)!;assert.equal(duty.due,'');assert.equal(duty.dueLabel,'Confirm notification deadline');
});

test('a source rule expressed in calendar months preserves the registration day',()=>{assert.equal(addMonths('2026-08-24',3),'2026-11-24');assert.equal(addMonths('2026-01-31',1),'2026-02-28');const d=seedData();d.rules[0].months=3;applyCommand(d,{type:'organization',values:d.organization},owner);assert.equal(d.obligations[0].due,'2026-11-24')});

test('membership forms can be added without inventing an admission date',()=>{const d=seedData();d.files.push(proof);const result=applyCommand(d,{type:'create',collection:'members',values:{title:'Documented member',applicationDate:'2026-09-01',fileId:'proof'}},owner);const m=d.members.find(m=>m.id===result.id)!;assert.equal(m.joined,'');assert.equal(m.applicationDate,'2026-09-01');assert.deepEqual(m.fileIds,['proof'])});
