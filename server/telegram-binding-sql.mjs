// Bridge only the existing platform's MySQL result/placeholder adapter. No
// connections, credentials, environment access or schema changes are created here.
export function telegramBindingSql(source){
 if(!source||source.dialect!=='mysql')return source;
 const client={async query(sql,values=[]){let n=0;const result=await source.query(sql.replace(/\?/g,()=>'$'+(++n)),values);return [result.rows||[]];},release(){source.release?.();}};
 if(typeof source.connect==='function')client.getConnection=async()=>telegramBindingSql(await source.connect());
 client.beginTransaction=()=>source.query('BEGIN');client.commit=()=>source.query('COMMIT');client.rollback=()=>source.query('ROLLBACK');
 if(typeof source.discard==='function')client.destroy=()=>source.discard();
 return client;
}
