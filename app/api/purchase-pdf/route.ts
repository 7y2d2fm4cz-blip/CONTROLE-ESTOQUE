import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {accessSession} from '../../../lib/access-control';
import {canExportPurchase} from '../../../lib/purchase-requests';
import {buildPurchasePdf} from '../../../lib/purchase-pdf';

export async function GET(req:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Faça login para gerar o PDF.'},{status:401});
 const row:any=await env.DB!.prepare('SELECT * FROM inventory_store WHERE id=?').bind('main').first();
 const data=row?JSON.parse(row.data):{purchaseRequests:[]};const session=accessSession(data,user);
 if(!session.role)return Response.json({error:'Acesso não autorizado.'},{status:403});
 const id=new URL(req.url).searchParams.get('purchaseId');const request=(data.purchaseRequests||[]).find((p:any)=>p.id===id);
 if(!request||(!session.canViewAllPurchases&&request.createdById!==user.userId))return Response.json({error:'Requisição não encontrada.'},{status:404});
 if(!canExportPurchase(request))return Response.json({error:'O PDF fica disponível após a aprovação. Requisições reprovadas ou canceladas não podem ser emitidas.'},{status:403});
 const bytes=await buildPurchasePdf(request);
 return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+request.number.replace(/[^A-Za-z0-9-]/g,'')+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
