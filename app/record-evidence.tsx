'use client';
import {useState} from 'react';
import {Upload} from 'lucide-react';
import {useApp,Button,FileLink,SearchBox,Status,EmptyState,f} from './ui';
import {formatDate,type Collection} from '@/lib/model';

export function RecordEvidence({collection,id,fileIds=[]}:{collection:Collection|'organization';id?:string;fileIds?:string[]}) {
 const {form,run,permissions}=useApp();
 const scope=['obligations','submissions','rules'].includes(collection)?'compliance':'governance';
 return <section className="record-evidence spaced"><h4>Supporting documents</h4>
  {fileIds.map(fileId=><FileLink key={fileId} id={fileId}/>)}
  {permissions.full&&<Button small onClick={()=>form({title:'Attach supporting document',description:'The original stays attached. Upload a corrected copy as a new document and explain the change.',fields:[f('fileId','Document','file',{scope}),f('reason','Document purpose / version note','textarea')],submit:'Attach document',onSubmit:v=>run({type:'attach_evidence',collection,id,...v})})}><Upload size={15}/> Attach document</Button>}
 </section>;
}

export function DocumentLibrary({scope}:{scope:'governance'|'compliance'}) {
 const {data,form,permissions}=useApp();const [query,setQuery]=useState('');
 const rows=data.files.filter(file=>(file.scope===scope||file.sections?.includes(scope))&&[file.title,file.category,file.description].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <><div className="toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Find a document…"/>
  {permissions.full&&<Button onClick={()=>form({title:'Upload '+scope+' document',description:'Upload here to retain a document in the library. To link it to a member, meeting or obligation, use Attach document in that record.',fields:[f('fileId','Document','file',{scope})],submit:'Done',onSubmit:async()=>{}})}><Upload size={16}/> Upload document</Button>}
 </div><div className="document-grid">{rows.map(file=><section className="panel document-card" key={file.id}>
  <div className="card-topline"><span className="eyebrow">{file.category||scope}</span><Status value={file.status}/></div>
  <FileLink id={file.id}/>{file.description&&<p className="panel-copy">{file.description}</p>}
  <small className="metadata">{Math.ceil(file.size/1024)} KB · Retained {formatDate(file.createdAt,true)}</small>
 </section>)}</div>{!rows.length&&<EmptyState title="No documents on this view" description="Upload a source document or adjust your search."/>}</>;
}
