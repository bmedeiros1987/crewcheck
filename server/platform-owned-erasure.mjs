// Preparatory statements for omitted platform-owned tables. No route, connection,
// DDL or external deletion. Caller must use its existing fenced transaction.
// This does not certify physical documents, caches, billing evidence or full erasure.
export function platformOwnedErasureStatements(email){
 if(typeof email!=='string'||email!==email.trim().toLowerCase()||email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email))throw new TypeError('Scoped owner required');
 return [
  ['DELETE FROM crewcheck_platform_addresses WHERE owner_email=$1',[email]],
  ['DELETE FROM crewcheck_platform_user_hotels WHERE owner_email=$1',[email]],
  ['DELETE FROM crewcheck_platform_gym_preferences WHERE owner_email=$1',[email]],
  ['DELETE FROM crewcheck_platform_routine_preferences WHERE owner_email=$1',[email]],
  ["DELETE FROM crewcheck_platform_finance_configs WHERE scope='user' AND owner_email=$1",[email]],
  ['DELETE FROM crewcheck_platform_flight_follows WHERE owner_email=$1',[email]],
  ['DELETE FROM crewcheck_platform_swap_analyses WHERE requester_email=$1',[email]],
  ['DELETE FROM crewcheck_platform_schedule_comparisons WHERE owner_email=$1 OR peer_email=$1',[email]],
 ];
}
