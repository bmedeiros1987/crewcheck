import { financialMonths, financialRange, financialWeeks, type FinancialRange } from './financialHistoryPeriods';
/** Civil work periods, never settlement dates. Preserve clipped boundaries. */
export function financialComparisonPeriods(scope: FinancialRange, grouping: 'month'|'week') {
  return (grouping==='week'?financialWeeks(scope):financialMonths(scope).map(month=>{
    const full=financialRange('month',month,'','','');
    return {...full,start:full.start<scope.start?scope.start:full.start,end:full.end>scope.end?scope.end:full.end};
  })).map(range=>{
    const full=financialRange(grouping,'',range.start,'','');
    const monthly=grouping==='month'?financialRange('month',range.start.slice(0,7),'','',''):full;
    return {range,complete:range.start===monthly.start&&range.end===monthly.end};
  });
}
