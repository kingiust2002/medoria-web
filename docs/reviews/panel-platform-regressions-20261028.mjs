// Independent review probes for pending stack b651cade11d1a9dc2fd054b48fffe997ae54359d.
// See ../PANEL_INDEPENDENT_REVIEW_2026-10-28.md for the reproduction procedure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getUser, rowToUser, consumeRecoveryCode, updateUser } from '../../lib/operator/accounts.js';
import { checkUserChange, decide } from '../../lib/operator/authz.js';
import { restrictedReason } from '../../lib/operator/access.js';
import { resetPersonPassword } from '../../lib/operator/userActionsCore.js';
import { deleteMedia } from '../../lib/operator/mediaLibrary.js';
import { makeProductExecutors } from '../../lib/operator/approvalExecutors.js';
import { applyCount } from '../../lib/warehouse/countsActions.js';
import { createMemoryAdmin } from '../../tests/helpers/memoryAdmin.mjs';

const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user = (n, extra={}) => ({id:uid(n),username:`person${n}`,display_name:`Person ${n}`,status:'active',role:'viewer',houses:['health'],allow_perms:[],deny_perms:[],approval:{},require_2fa:false,must_change_password:false,authz_version:1,version:1,...extra});

test('review: account with configured required 2FA is not restricted after a real column projection', async()=>{
  const row=user(1,{require_2fa:true,totp_secret_enc:'encrypted-test-seed',recovery_hashes:['test-hash']});
  const admin={from(){let columns; const q={select(c){columns=c;return q},eq(){return q},limit(){return Promise.resolve({data:[Object.fromEntries(columns.split(',').map(k=>[k,row[k]]))],error:null})}};return q}};
  const got=await getUser(admin,row.id);
  assert.equal(got.ok,true);
  assert.equal(got.user.hasTotp,true,'the DB has a TOTP seed, but PUBLIC_COLUMNS omits the field rowToUser uses');
  assert.equal(restrictedReason({user:got.user}),null);
});

test('review: delegated users manager cannot grant direct execution of own approval-only operation',()=>{
  const actor=rowToUser(user(1,{role:'product_manager',allow_perms:['users.manage'],approval:{health:['products.price']}}));
  assert.equal(decide(actor,'health','products.price').mode,'approval');
  const change={role:'product_manager',houses:['health'],allow:[],deny:[],approval:{health:[]},status:'active'};
  const verdict=checkUserChange({actor,target:null,change,users:[actor]});
  assert.equal(verdict.ok,false,'delegation must not remove the actor approval restriction');
});

test('review: low privilege users manager cannot reset a stronger non-owner account',async()=>{
  const actorRow=user(1,{allow_perms:['users.manage']});
  const stronger=user(2,{role:'house_admin',require_2fa:false});
  const db=createMemoryAdmin({operator_users:[actorRow,stronger],operator_sessions:[]});
  const result=await resetPersonPassword({admin:db,panel:'health',session:{user:rowToUser(actorRow)},audit:async()=>({ok:true})},stronger.id);
  assert.equal(result.ok,false,'viewer + users.manage obtained a temporary password for house_admin');
  assert.equal(result.tempPassword,undefined);
});

test('review: an in-use Beauty brand logo cannot be deleted when schema has name rather than name_en',async()=>{
  let removed=false;
  const admin={from(table){return {select(columns){return Promise.resolve(table==='beauty_brands' && columns.includes('name_en') ? {data:null,error:{code:'42703',message:'column beauty_brands.name_en does not exist'}} : {data:table==='beauty_brands' ? [{id:9,slug:'official',name:'Official Brand',logo_url:'https://example.invalid/storage/v1/object/public/beauty-brand-logos/logos/official.png'}] : [],error:null})}}},storage:{from(){return {remove:async()=>{removed=true;return {data:[{name:'logos/official.png'}],error:null}}}}}};
  const result=await deleteMedia(admin,'beauty',{bucket:'beauty-brand-logos',path:'logos/official.png'});
  assert.equal(result.ok,false,'unknown-column error must not mark all brand logos unused');
  assert.equal(removed,false);
});

test('review: count changed during execution cannot be closed as the earlier approved snapshot',async()=>{
  let db;
  const posted=[];
  db=createMemoryAdmin({health_stock_counts:[{id:1,location_id:1,status:'open'}],health_stock_count_lines:[{count_id:1,product_id:7,sku:'G-7',expected:10,counted:8}],products:[{id:7,sku:'G-7',name_en:'Gloves'}]}, {rpc:{health_stock_post:async args=>{
    posted.push(args);
    // A concurrent valid save arrives after approval's comparison but before finish.
    db.tables.health_stock_count_lines[0].counted=6;
    return {data:{ok:true,replayed:false,movement_ids:[1],balance_after:8},error:null};
  }}});
  const result=await applyCount(db,'health',1,{userId:uid(1),label:'review'},{expected:[[7,-2]],requestId:uid(9)});
  assert.equal(result.ok,false,'the count closed with counted=6 after applying delta=-2 from counted=8');
});


test('review: concurrent consumption of different recovery codes cannot resurrect a spent code',async()=>{
  const db=createMemoryAdmin({operator_users:[user(1,{recovery_hashes:['hash-A','hash-B']})]});
  const original=['hash-A','hash-B'];
  const first=await consumeRecoveryCode(db,{userId:uid(1),hash:'hash-A',hashes:original});
  // A second request read the same original array before the first update committed.
  const second=await consumeRecoveryCode(db,{userId:uid(1),hash:'hash-B',hashes:original});
  assert.equal(first.ok,true);
  // A safe implementation may reject/retry the stale second request. It must never restore A.
  assert.equal(db.tables.operator_users[0].recovery_hashes.includes('hash-A'),false,'A was already spent but the stale B update restores A');
});

test('review: a delegated users manager cannot remove their own owner-imposed 2FA requirement',async()=>{
  const person=user(1,{allow_perms:['users.manage'],require_2fa:true});
  const db=createMemoryAdmin({operator_users:[person]});
  const result=await updateUser(db,{actor:rowToUser(person),id:person.id,change:{require2fa:false},expectedVersion:1});
  assert.equal(result.ok,false,'own require_2fa changed despite the self-power guard');
  assert.equal(db.tables.operator_users[0].require_2fa,true);
});


test('review: an approved archived-product deletion refuses a newer product version',async()=>{
 const db=createMemoryAdmin({products:[{id:8,sku:'SKU-8',name_en:'Edited after request',is_active:false,updated_at:'2026-10-28T12:00:00Z'}]});
 const executors=makeProductExecutors({panel:'health',session:{panel:'health'},audit:async()=>({ok:true})});
 const result=await executors['products.delete']({admin:db,request:{entity_id:8,base_updated_at:'2026-10-27T12:00:00Z',proposed:{confirmation:'SKU-8'}}});
 assert.equal(result.ok,false,'delete ignores base_updated_at and removes a newer archived product');
 assert.equal(db.tables.products.length,1);
});
