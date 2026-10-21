import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {accessSession} from '../../../lib/access-control';
import {materialTemplateBase64} from '../../../lib/material-template';
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Faça login para continuar.'},{status:401});
 const row:any=await env.DB!.prepare('SELECT * FROM inventory_store WHERE id=?').bind('main').first();const data=row?JSON.parse(row.data):{};
 if(!accessSession(data,user).canOperateStock)return Response.json({error:'Seu perfil não permite importar materiais.'},{status:403});
 const bytes=Uint8Array.from(atob(materialTemplateBase64),c=>c.charCodeAt(0));
 return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="modelo-materiais.xlsx"','Cache-Control':'private, no-store'}});
}
