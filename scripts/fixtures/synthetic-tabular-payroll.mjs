import {jsPDF} from 'jspdf';
// Fully invented payroll, including all identifiers, dates and amounts.
export function syntheticTabularPayroll(options={}){
 const pdf=new jsPDF({unit:'pt',format:'a4'});pdf.setFontSize(8);
 const at=(x,y,text)=>{if(text!==null&&text!==undefined&&text!=='')pdf.text(String(text),x,y);};
 let paymentInternalX=null;
 const row=(y,cells)=>cells.forEach(([x,t])=>{if(options.fragmented&&typeof t==='string'&&t.includes(' ')){let cursor=x;for(const [index,word] of t.split(' ').entries()){pdf.setFont('helvetica',index%2?'bold':'normal');if(t==='Tipo de Pagamento'&&index===1)paymentInternalX=cursor;at(cursor,y,word);cursor+=pdf.getTextWidth(word)+(options.fragmentGap??pdf.getTextWidth(' '));}pdf.setFont('helvetica','normal');}else at(x,y,t);});
 if(options.companyHeader)at(10,45,'EMPRESA FICTICIA CNPJ: 12.345.678/0001-90'+(options.companyUnknownMoney?' PROVENTO 777,00':''));
 at(10,20,'DEMONSTRATIVO DE PAGAMENTO - EMPRESA SINTETICA');at(10,34,'Titular: PESSOA FICTICIA - IDENTIFICADOR TESTE-000');
 row(55,[[10,'Competência'],[105,options.noPaymentTypeHeader?'Campo não identificado':'Tipo de Pagamento'],[210,options.noBaseHeader?'Campo sem identificação':options.broken?'Salário':'Salário Base'],[305,'Carga Hrs Mês'],[420,'Dep. SF'],[490,'Dep. IR']]);if(options.broken)at(210,65,'Base');if(options.orphanFragmentLine&&paymentInternalX!==null)at(paymentInternalX,65,'Indefinido');
 row(80,[[10,options.competence??'10/2032'],[105,options.paymentType??'Mensal'],[210,options.base??'3.600,00'],[305,'220,00'],[420,'0'],[490,'0']]);
 row(100,[[10,'Banco'],[105,'Agência'],[210,'Conta Corrente'],[330,'Data de Admissão'],[480,'Data do Depósito']]);row(115,[[10,'BANCO FICTICIO'],[105,'0000'],[210,'TESTE-NAO-CONTA'],[330,'01.02.2030'],[480,options.date??'11.11.2032']]);
 if(options.orphanBeforeTable)row(135,[[10,'9999'],[195,'Provento sem cabeçalho'],[390,'777,00']]);
 const xs=options.tightColumns?[10,45,80,125,370,465]:[10,65,125,195,390,480];row(145,xs.map((x,i)=>[x,['Rubrica','Qtde.','Razão','Descrição','Proventos','Descontos'][i]]));
 const items=[['100','15,00','120.0000','Salário proporcional','1.800,00',null],['200','1.000,00','0.10000','KM V CMS - D','100,00',null],['300',null,null,'Provisão Contr. INSS rec.','50,00',null],['400',null,null,'Adicional sintético','150,00',null],['500',null,null,'INSS',null,'100,00'],['600',null,null,'IRRF',null,'0,00'],['700',null,null,'Desconto sintético',null,'50,00']];
 if(options.mixedCodes){items[1][0]='AB12';items[2][0]='/123';}
 if(options.inventorySize){while(items.length<options.inventorySize){const i=items.length-7;items.push([i%3===0?'XZ'+String(i).padStart(2,'0'):i%3===1?'/'+String(100+i):String(800+i),null,null,'Rubrica sintética '+i,i%2===0?'10,00':null,i%2===1?'2,00':null]);}}
 if(options.badCode)items[1][0]='AB/12/';
 if(options.salaryLabel)items[0][3]='Salário Base';if(options.ambiguous)items[2][5]='1,00';if(options.missing)items[1][4]=null;if(options.zero)items[1][4]='0,00';if(options.badQuantity)items[1][1]='1.00,0';
 items.forEach((v,i)=>{if(options.multiplePages&&i===4||options.inventorySize&&i>0&&i%15===0){pdf.addPage();row(145,xs.map((x,j)=>[x,['Rubrica','Qtde.','Razão','Descrição','Proventos','Descontos'][j]]));}row(165+(options.inventorySize?i%15:i)*15,xs.map((x,j)=>[x,v[j]]));});
 const extras=Math.max(0,items.length-7),gross=210000+Math.ceil(extras/2)*1000,deductions=15000+Math.floor(extras/2)*200;const brl=n=>(n/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});const fy=options.inventorySize?185+((items.length-1)%15+1)*15:285;
 row(fy,[[125,'TOTAIS'],[xs[4],options.zero?'2.000,00':options.gross??brl(gross)],[xs[5],brl(deductions)]]);
 if(options.footerRight){const shift=options.footerUnprovenRight?10:0;pdf.text('FGTS',473.4,fy+25,{align:'right'});pdf.text('Líquido',534.35,fy+25,{align:'right'});pdf.text('168,00',473.4-shift,fy+40,{align:'right'});pdf.text(options.net??brl(gross-deductions),534.35-shift,fy+40,{align:'right'});}else{row(fy+25,[[125,'FGTS'],[370,'Líquido']]);row(fy+40,[[125,'168,00'],[370,options.zero?'1.850,00':options.net??brl(gross-deductions)]]);}
 if(options.conflict){row(345,[[125,'FGTS'],[370,'Líquido']]);row(358,[[125,'168,00'],[370,'1.949,00']]);}
 at(10,fy+95,'Base de Calculos');row(fy+110,[[10,'Base INSS'],[125,'2.100,00'],[230,'Base IRRF'],[350,'2.100,00']]);row(fy+125,[[10,'Base FGTS'],[125,'2.100,00'],[230,'Compensação orgânica'],[430,'200,00']]);at(10,fy+150,'Parcelas NÃO descontadas');row(fy+165,[[10,'999'],[125,'INSS informativo'],[465,'999,00']]);
 if(options.secondTable){row(480,xs.map((x,j)=>[x,['Rubrica','Qtde.','Razão','Descrição','Proventos','Descontos'][j]]));row(495,[[10,'9999'],[195,'Outro provento'],[390,'999,00']]);}
 if(options.partialContinuation){pdf.addPage();row(20,[[10,'Competência'],[210,'Salário Base']]);row(35,[[10,'10/2032'],[210,'3.600,00']]);row(60,[[10,'9999'],[195,'Provento sem cabeçalho de coluna'],[390,options.partialToken??'777,00']]);}
 if(options.headerlessContinuation){pdf.addPage();row(60,[[10,'9999'],[195,'Provento sem cabeçalho'],[390,'777,00']]);}
 if(options.extraPage){pdf.addPage();at(10,20,'Conteúdo adicional 999,00 sem cabeçalho comprovado');}
 return Buffer.from(pdf.output('arraybuffer'));
}
