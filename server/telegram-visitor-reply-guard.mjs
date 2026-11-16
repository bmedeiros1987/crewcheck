// Request-local revalidation only. This is not durable provider admission and
// cannot retract data already submitted or serialize independent ACL writers.
export function createTelegramVisitorReplyGuard({db,visitor,chatId,ownerId,allowedPermissions,subscriptionStatus,send}){
 const expected=structuredClone(visitor),destination=String(chatId),resources=[],expectedOwnerId=String(ownerId||'');
 const version=value=>value instanceof Date?value.toISOString():String(value||'');
 const permissions=row=>JSON.stringify(allowedPermissions(row.permissions));
 const denied=reason=>({ok:false,blocked:true,uncertain:false,reason});
 return {
  observe(sql,params,rows){resources.push({sql,params:structuredClone(params),snapshot:JSON.stringify(rows)});},
  async send(text){
   try{
    for(const resource of resources){const fresh=await db.query(resource.sql,resource.params);if(JSON.stringify(fresh.rows)!==resource.snapshot)return denied('VISITOR_RESOURCE_CHANGED');}
    const owner=await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1',[expected.owner_email]);
    if(!expectedOwnerId||String(owner.rows[0]?.public_id||'')!==expectedOwnerId||!(await subscriptionStatus(db,owner.rows[0])).premiumAccess)return denied('VISITOR_OWNER_ACCESS_CHANGED');
    const result=await db.query('SELECT * FROM crewcheck_platform_visitors WHERE id=$1 AND telegram_chat_id=$2 LIMIT 1',[expected.id,destination]);
    const current=result.rows[0];
    if(!current||current.status!=='active'||current.id!==expected.id||current.owner_email!==expected.owner_email||current.email!==expected.email||String(current.telegram_chat_id)!==destination||permissions(current)!==permissions(expected)||version(current.updated_at)!==version(expected.updated_at))return denied('VISITOR_AUTHORIZATION_CHANGED');
   }catch{return denied('VISITOR_AUTHORIZATION_UNAVAILABLE');}
   return send(destination,text);
  }
 };
}
