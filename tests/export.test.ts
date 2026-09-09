import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {csv,zip,checksum,reportHtml} from '../lib/export.ts';
import {seedData} from '../lib/model.ts';
import {applyCommand} from '../lib/domain.ts';
test('CSV quotes values and prevents spreadsheet formula execution',()=>{const result=csv([{value:'=CMD()',name:'a,"b"'}],['value','name']);assert.ok(result.includes('"\'=CMD()"'));assert.ok(result.includes('"a,""b"""'))});
test('ZIP retains unicode names and bytes with valid headers',async()=>{const bytes=new TextEncoder().encode('Atoll Commons · ކޮމަންސް');const output=zip([{name:'sample.txt',bytes},{name:'report.csv',bytes:new TextEncoder().encode('title,amount\r\nTest,150')}]);assert.equal(new DataView(output.buffer).getUint32(0,true),0x04034b50);assert.equal((await checksum(bytes)).length,64);writeFileSync('/tmp/atoll-package-test.zip',output)});
test('HTML report escapes content and preserves Dhivehi support',()=>{const d=seedData();d.reports[0].narrative='<script>alert(1)</script>';d.reports[0].gates={finance:true,compliance:true,committee:true,agm:true,signatures:true};d.transactions.forEach(t=>{t.status='Reconciled';t.evidence='test'});applyCommand(d,{type:'report',id:'report1',action:'lock'},{name:'Test reviewer',email:'test@example.test',role:'System owner',governance:false,projects:[]});const html=reportHtml(d.reports[0].versions[0].snapshot,true);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('dir="rtl"'));assert.ok(html.includes('SAMPLE RECORDS'));assert.ok(!html.includes('Founding member 01'))});
