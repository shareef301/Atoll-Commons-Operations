import {seedData,normalizeWorkspace,type WorkspaceData} from './model.ts';
import {governancePermissions,publicMemberUpdates} from './governance.ts';
export type AccessSession={data:WorkspaceData;revision:number;access:{name:string;email:string;role:string;projects:string;governance:number};user:{displayName:string;email:string};members:any[]};
export const governanceAccess=(s:AccessSession)=>governancePermissions(s.data,{name:s.access.name,role:s.access.role,email:s.user.email});
export const fullAccess=(s:AccessSession)=>s.access.role==='System owner'||s.access.role==='Compliance secretary';
export const projectAccess=(s:AccessSession,id:string)=>fullAccess(s)||JSON.parse(s.access.projects).includes(id);
export function canCollection(s:AccessSession,c:string,write=false){if(['General member','Disabled'].includes(s.access.role))return false;if(fullAccess(s))return true;if(['Project lead','Project participant','Project sponsor','Continuity deputy'].includes(s.access.role))return ['projects','milestones','activities','cases','files'].includes(c);if(s.access.role==='Treasurer')return ['transactions','donations','assets','reports','files'].includes(c);if(['Auditor','Approver','Observer'].includes(s.access.role))return !write&&['projects','milestones','activities','reports','files','obligations'].includes(c);return false}
export function fileAccess(s:AccessSession,f:any,write=false){if(['General member','Disabled'].includes(s.access.role))return false;const p=governanceAccess(s);if(f.scope==='dues')return write?p.duesWrite:p.dues;if(f.scope==='exco')return p.governance;if(p.exco&&['governance','compliance','organization'].includes(f.scope)&&!f.projectId)return true;if(fullAccess(s))return true;if(f.projectId)return projectAccess(s,f.projectId)&&(!write||['Project lead','Project participant','Project sponsor','Continuity deputy'].includes(s.access.role));if(s.access.role==='Treasurer'&&f.scope==='finance')return true;const scope=JSON.parse(s.access.projects);if(f.scope?.startsWith('report:')&&scope.includes(f.scope.slice(7)))return !write||s.access.role==='Approver';if(!write&&['Approver','Auditor','Observer'].includes(s.access.role))return s.data.reports.some(r=>scope.includes(r.id)&&(r.exportId===f.id||r.approvals?.some((a:any)=>a.fileId===f.id)||r.versions?.some((v:any)=>v.exportId===f.id||v.snapshot.approvals?.some((a:any)=>a.fileId===f.id)||v.snapshot.acceptedResults?.some((m:any)=>m.fileId===f.id)||v.snapshot.transactions?.some((t:any)=>t.fileId===f.id))));return false}
export function projectWorkspace(s:AccessSession){let d=structuredClone(normalizeWorkspace(s.data)),p=governanceAccess(s);
 if(!fullAccess(s)){
  for(const key of Object.keys(d)){if(Array.isArray((d as any)[key])&&!canCollection(s,key))(d as any)[key]=[];}
  d.projects=d.projects.filter(x=>projectAccess(s,x.id));d.milestones=d.milestones.filter(x=>projectAccess(s,x.projectId));d.activities=d.activities.filter(x=>projectAccess(s,x.projectId));d.cases=d.cases.filter(x=>projectAccess(s,x.projectId));d.files=s.data.files.filter(f=>fileAccess(s,f));d.audit=[];
  if(['Auditor','Approver','Observer'].includes(s.access.role)){d.reports=d.reports.filter(r=>JSON.parse(s.access.projects).includes(r.id));d.obligations=[];}
 }
 // Private workflow fields have their own grants, independent of legacy broad roles.
 d.duesAccounts=p.dues?structuredClone(s.data.duesAccounts):[];d.duesPayments=p.dues?structuredClone(s.data.duesPayments):[];
 d.decisions=p.governance?structuredClone(s.data.decisions):[];
 d.communications=p.communications?structuredClone(s.data.communications):publicMemberUpdates(s.data,s.user.email);
 d.governanceSettings=p.communications||p.admin?structuredClone(s.data.governanceSettings):[];
 d.accessLinks=p.admin||p.exco?structuredClone(s.data.accessLinks):[];
 d.mailOutbox=p.governance?structuredClone(s.data.mailOutbox):[];
 d.files=d.files.filter(f=>fileAccess(s,f));
 d.audit=d.audit.filter(h=>h.privacy==='dues'?p.dues:h.privacy==='exco'?p.governance:true);
 if(p.exco){for(const key of ['members','committee','meetings','obligations','submissions','rules'] as const)d[key]=structuredClone(s.data[key]);}
 if(p.dues&&!fullAccess(s)&&!p.exco)d.members=s.data.members.map(m=>({id:m.id,title:m.title,status:m.status,departedAt:m.departedAt}));
 if(p.duesWrite&&!fullAccess(s)&&s.access.role!=='Treasurer')d.transactions=s.data.transactions.filter(t=>t.type==='Income'&&t.status==='Reconciled').map(t=>({id:t.id,title:t.title,status:t.status,type:t.type,amount:t.amount,date:t.date}));
 if(p.communications&&!p.exco&&!fullAccess(s))d.members=s.data.members.map(m=>({id:m.id,title:m.title,status:m.status,email:m.email}));
 if(p.memberOnly||p.disabled){
  // An allowlisted projection prevents future JSON fields, notes, identities or exports leaking.
  const updates=d.communications;d=seedData();d.mode=s.data.mode;for(const key of Object.keys(d))if(Array.isArray((d as any)[key]))(d as any)[key]=[];d.communications=updates;
  const o=s.data.organization;d.organization={name:o.name,dhivehi:o.dhivehi,registration:o.registration,registeredAt:o.registeredAt,year:o.year,mira:'',address:o.address,timezone:o.timezone,email:o.email,website:o.website};
 }
 delete (d as any).operations;
 return {data:d,revision:s.revision,user:{name:s.user.displayName,email:s.user.email,role:s.access.role,governance:!!s.access.governance},members:fullAccess(s)?s.members:[],permissions:{full:fullAccess(s),finance:fullAccess(s)||s.access.role==='Treasurer',...p,mailConfigured:false}};
}
