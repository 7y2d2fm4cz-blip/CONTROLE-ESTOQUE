import type {ChatGPTUser} from '../app/chatgpt-auth';

export const roles=['admin','requisitante','almoxarife'] as const;
export type Role=typeof roles[number];
export const roleNames:Record<string,string>={admin:'Administrador',requisitante:'Requisitante',almoxarife:'Almoxarife'};
const initialAdminEmail='69tjwwwnrj@privaterelay.appleid.com';
const normalizeEmail=(value:unknown)=>String(value??'').trim().toLowerCase();

export function ensureAccess(data:any) {
 if(!data.access){data.access={users:[{id:'initial-admin',email:initialAdminEmail,name:'Manoel Mendes',userId:null,role:'admin',status:'active'}],log:[]};}
 return data.access;
}

export function memberFor(data:any,user:ChatGPTUser) {
 const access=ensureAccess(data);
 // Once registered, authorization follows the stable Site identity, never a client-supplied ID.
 return access.users.find((m:any)=>m.userId===user.userId)||access.users.find((m:any)=>!m.userId&&normalizeEmail(m.email)===normalizeEmail(user.email));
}

export function accessSession(data:any,user:ChatGPTUser) {
 const member=memberFor(data,user);const active=member?.status==='active';const role:Role|null=active&&roles.includes(member.role)?member.role:null;
 return {userId:user.userId,email:user.email,displayName:user.displayName,role,roleName:role?roleNames[role]:'Sem acesso',status:member?.status||'unregistered',canManageUsers:role==='admin',canOperateStock:role==='admin'||role==='almoxarife',canSeeCosts:role==='admin'||role==='almoxarife',canRequest:!!role};
}

export function presentStock(data:any,version:number,user:ChatGPTUser) {
 const session=accessSession(data,user);
 if(!session.role)return {materials:[],invoices:[],moves:[],projects:[],shelves:[],requests:[],version,session};
 const {access,...stock}=data;
 if(session.role==='requisitante'){
  const requests=data.requests.filter((r:any)=>r.createdById===user.userId);
  const ids=new Set(requests.map((r:any)=>r.id));
  return {...stock,materials:data.materials.map((m:any)=>{const {average,...safe}=m;return safe;}),invoices:[],moves:data.moves.filter((m:any)=>m.requestId&&ids.has(m.requestId)),requests,version,session};
 }
 return {...stock,...(session.canManageUsers?{access}:{}),version,session};
}

export function canPerform(data:any,user:ChatGPTUser,action:string,requestId?:string) {
 const session=accessSession(data,user);
 if(action==='request-access')return !session.role&&session.status==='unregistered';
 if(!session.role)return false;
 if(action==='manage-user')return session.canManageUsers;
 if(action==='request')return true;
 if(action==='cancel-request')return session.canOperateStock||data.requests.some((r:any)=>r.id===requestId&&r.createdById===user.userId);
 return session.canOperateStock&&['receive','out','material','project','shelf','fulfill-request','extract'].includes(action);
}

export function bindMember(data:any,user:ChatGPTUser) {
 const member=memberFor(data,user);if(member&&!member.userId)member.userId=user.userId;
}

export function manageUser(data:any,user:ChatGPTUser,body:any,now:string) {
 const access=ensureAccess(data);const actor=memberFor(data,user);let target=body.id?access.users.find((m:any)=>m.id===body.id):null;
 if(body.id&&!target)throw Error('Usuário não encontrado.');
 if(!roles.includes(body.role)||!['active','blocked'].includes(body.status))throw Error('Selecione um perfil e uma situação válidos.');
 if(target?.id===actor?.id&&(body.role!=='admin'||body.status!=='active'))throw Error('Você não pode remover o próprio acesso de administrador.');
 const email=normalizeEmail(target?.email||body.email);
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Informe um e-mail válido.');
 if(!target&&access.users.some((m:any)=>normalizeEmail(m.email)===email))throw Error('E-mail já cadastrado. Edite o usuário existente.');
 const name=String(body.name||target?.name||email).trim().slice(0,200);
 const before=target?{role:target.role,status:target.status}:null;
 if(target)Object.assign(target,{name,role:body.role,status:body.status,updatedAt:now,updatedBy:user.displayName});
 else{target={id:crypto.randomUUID(),email,name,userId:null,role:body.role,status:body.status,createdAt:now,updatedAt:now,updatedBy:user.displayName};access.users.push(target);}
 if(!access.users.some((m:any)=>m.role==='admin'&&m.status==='active'))throw Error('Mantenha pelo menos um administrador ativo.');
 access.log.unshift({id:crypto.randomUUID(),date:now,actor:user.displayName,actorId:user.userId,email:target.email,before,after:{role:target.role,status:target.status}});access.log=access.log.slice(0,100);
}
