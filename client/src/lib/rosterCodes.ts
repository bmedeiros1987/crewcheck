export type RosterCodeCategory =
  | 'GROUND_DUTY'
  | 'SIMULATOR'
  | 'DAY_OFF'
  | 'DAY_MARKER'
  | 'TRANSPORT'
  | 'RESERVE'
  | 'STANDBY'
  | 'MEDICAL'
  | 'MEETING'
  | 'OTHER';

export type RosterCodeDefinition = {
  code: string;
  title: string;
  description: string;
  category: RosterCodeCategory;
  source?: string;
};

const rawRosterCodes: RosterCodeDefinition[] = [
  { code: 'A320', title: 'A320', description: 'A320 Ground school', category: 'GROUND_DUTY' },
  { code: 'ADAP', title: 'ADAP', description: 'Adaptation in Simulator', category: 'GROUND_DUTY' },
  { code: 'ADM', title: 'ADM', description: 'Admin', category: 'OTHER' },
  { code: 'ADM-JJBR', title: 'ADM-JJBR', description: 'Admin', category: 'GROUND_DUTY' },
  { code: 'AMTT_JJ', title: 'AMTT_JJ', description: 'Avaliação médica -- TT8', category: 'TRANSPORT' },
  { code: 'APE', title: 'APE', description: '[Online FoxSystem] Atendimento a Passageiros Especiais', category: 'GROUND_DUTY' },
  { code: 'APR', title: 'APR', description: 'Apresentação', category: 'GROUND_DUTY' },
  { code: 'APRO_JJ', title: 'APRO_JJ', description: 'Apresentação original', category: 'DAY_OFF' },
  { code: 'APT-BRA', title: 'APT-BRA', description: 'Periodic AQP session APT', category: 'SIMULATOR' },
  { code: 'AQP', title: 'AQP', description: 'AQP training', category: 'SIMULATOR' },
  { code: 'ASB', title: 'ASB', description: 'Reserva / Airport Stand By', category: 'RESERVE' },
  { code: 'ASB1', title: 'ASB1', description: 'Airport stand by 1', category: 'RESERVE' },
  { code: 'ASB2', title: 'ASB2', description: 'Airport stand by 2', category: 'RESERVE' },
  { code: 'ASB3', title: 'ASB3', description: 'Airport stand by 3', category: 'RESERVE' },
  { code: 'ATZ', title: 'ATZ', description: 'Atraso injustificado', category: 'GROUND_DUTY' },
  { code: 'ATZJ', title: 'ATZJ', description: 'Atraso justificado', category: 'DAY_MARKER' },
  { code: 'AUT', title: 'AUT', description: 'Autismo', category: 'GROUND_DUTY' },
  { code: 'AWO', title: 'AWO', description: 'All Weather Operation', category: 'GROUND_DUTY' },
  { code: 'B', title: 'B', description: 'Blank', category: 'GROUND_DUTY' },
  { code: 'B767', title: 'B767', description: 'Initial B767 Ground school', category: 'GROUND_DUTY' },
  { code: 'B777', title: 'B777', description: 'Initial B777 Ground school', category: 'GROUND_DUTY' },
  { code: 'B787', title: 'B787', description: 'Initial B787 Ground school', category: 'GROUND_DUTY' },
  { code: 'BKF', title: 'BKF', description: 'Breakfast', category: 'GROUND_DUTY' },
  { code: 'BUS', title: 'BUS', description: 'Deslocamento ÔNIBUS/VAN', category: 'TRANSPORT' },
  { code: 'C32F', title: 'C32F', description: '[Presencial] Check A32F', category: 'GROUND_DUTY' },
  { code: 'C767', title: 'C767', description: 'Periodic check B767', category: 'GROUND_DUTY' },
  { code: 'C777', title: 'C777', description: 'Periodic check B777', category: 'GROUND_DUTY' },
  { code: 'C778', title: 'C778', description: 'Periodic check B777 and B787', category: 'GROUND_DUTY' },
  { code: 'C787', title: 'C787', description: 'Periodic check B787', category: 'GROUND_DUTY' },
  { code: 'CAF', title: 'CAF', description: 'Ação de combate de fadiga', category: 'GROUND_DUTY' },
  { code: 'CANCEL', title: 'CANCEL', description: 'Evento cancelado pela LATAM', category: 'SIMULATOR' },
  { code: 'CAT', title: 'CAT', description: 'CAT III Ground training', category: 'GROUND_DUTY' },
  { code: 'CATS_JJ', title: 'CATS_JJ', description: 'CAT III Simulator', category: 'SIMULATOR' },
  { code: 'CBF', title: 'CBF', description: 'EAD - Combate ao Fogo', category: 'GROUND_DUTY' },
  { code: 'CDM', title: 'CDM', description: 'Corte dos motores', category: 'OTHER' },
  { code: 'CEQ', title: 'CEQ', description: 'Leave Chief Equipment', category: 'DAY_MARKER' },
  { code: 'CFI', title: 'CFI', description: 'Instructor Training', category: 'GROUND_DUTY' },
  { code: 'CFIT', title: 'CFIT', description: 'Unknown Code', category: 'GROUND_DUTY' },
  { code: 'CH', title: 'CH', description: 'Court Hearing', category: 'DAY_MARKER' },
  { code: 'CHK', title: 'CHK', description: 'Check', category: 'OTHER' },
  { code: 'CHKI-BR', title: 'CHKI-BR', description: 'Initial simulator check', category: 'SIMULATOR' },
  { code: 'CHKP-BR', title: 'CHKP-BR', description: 'Periodic simulator check', category: 'GROUND_DUTY' },
  { code: 'CIPA', title: 'CIPA', description: 'Atividade CIPA', category: 'GROUND_DUTY' },
  { code: 'CLA', title: 'CLA', description: 'Ground training', category: 'GROUND_DUTY' },
  { code: 'CLTM', title: 'CLTM', description: 'Cultura LATAM', category: 'GROUND_DUTY' },
  { code: 'CMA', title: 'CMA', description: 'Aeronautical Medical Certificate', category: 'GROUND_DUTY' },
  { code: 'CNA', title: 'CNA', description: 'Airport Cancellation', category: 'OTHER' },
  { code: 'CODC-JJ', title: 'CODC-JJ', description: '[Online FoxSystem] Código de Conduta', category: 'GROUND_DUTY' },
  { code: 'CODC_JJ', title: 'CODC_JJ', description: 'Código de Conduta', category: 'GROUND_DUTY' },
  { code: 'CODC_M3', title: 'CODC_M3', description: 'Conduct code training', category: 'GROUND_DUTY' },
  { code: 'COVD_JJ', title: 'COVD_JJ', description: 'Suspeita COVID-19', category: 'DAY_MARKER' },
  { code: 'CPDLC', title: 'CPDLC', description: 'CPDLC Training', category: 'GROUND_DUTY' },
  { code: 'CPER', title: 'CPER', description: '[Online Classroom] Artigos Perigosos', category: 'GROUND_DUTY' },
  { code: 'CPT', title: 'CPT', description: 'Cockpit Procedure Training', category: 'GROUND_DUTY' },
  { code: 'CRM', title: 'CRM', description: '[Classroom] Treinamento CRM', category: 'GROUND_DUTY' },
  { code: 'CRM_SS', title: 'CRM_SS', description: 'CRM Training - corporate', category: 'GROUND_DUTY' },
  { code: 'CRMBSB', title: 'CRMBSB', description: 'CRM Corporate BSB', category: 'GROUND_DUTY' },
  { code: 'CRMCML', title: 'CRMCML', description: 'CRM Corporate CML', category: 'GROUND_DUTY' },
  { code: 'CRMD', title: 'CRMD', description: 'CRM Training - Dirigido', category: 'GROUND_DUTY' },
  { code: 'CRMIN', title: 'CRMIN', description: 'CRM Training - corporate', category: 'GROUND_DUTY' },
  { code: 'CRMSDU', title: 'CRMSDU', description: 'CRM Corporate SDU', category: 'GROUND_DUTY' },
  { code: 'CS', title: 'CS', description: 'Ground training', category: 'DAY_MARKER' },
  { code: 'CSO', title: 'CSO', description: '[Online FoxSystem] Segurança Operacional', category: 'GROUND_DUTY' },
  { code: 'DAQP', title: 'DAQP', description: 'AQP Documentation', category: 'GROUND_DUTY' },
  { code: 'DATL', title: 'DATL', description: 'ATL Leave', category: 'DAY_MARKER' },
  { code: 'DB', title: 'DB', description: 'Birthday Day Off - Folga Aniversário', category: 'DAY_OFF' },
  { code: 'DBC', title: 'DBC', description: 'Birthday couple day off', category: 'DAY_OFF' },
  { code: 'DC', title: 'DC', description: 'Couple day off', category: 'DAY_OFF' },
  { code: 'DCGH', title: 'DCGH', description: 'CGH movement', category: 'GROUND_DUTY' },
  { code: 'DCH', title: 'DCH', description: 'Chief day off', category: 'DAY_OFF' },
  { code: 'DE', title: 'DE', description: 'Election day off', category: 'DAY_OFF' },
  { code: 'DEI', title: 'DEI', description: 'Diversidade e Inclusão', category: 'GROUND_DUTY' },
  { code: 'DF', title: 'DF', description: 'Father day off', category: 'DAY_OFF' },
  { code: 'DGRU', title: 'DGRU', description: 'GRU movement', category: 'DAY_MARKER' },
  { code: 'DH', title: 'DH', description: 'Folga Final de Ano', category: 'DAY_OFF' },
  { code: 'DMIG', title: 'DMIG', description: 'Migracion movement', category: 'GROUND_DUTY' },
  { code: 'DMO', title: 'DMO', description: 'Luto', category: 'DAY_MARKER' },
  { code: 'DNI', title: 'DNI', description: 'Teste de Idioma', category: 'GROUND_DUTY' },
  { code: 'DO', title: 'DO', description: 'Folga', category: 'DAY_OFF' },
  { code: 'DOA', title: 'DOA', description: 'Additional Day Off', category: 'DAY_OFF' },
  { code: 'DOB', title: 'DOB', description: 'Day Off Base', category: 'DAY_OFF' },
  { code: 'DOBI', title: 'DOBI', description: 'Day Off Internacional Base', category: 'DAY_OFF' },
  { code: 'DOF', title: 'DOF', description: 'Annual fixed day off', category: 'DAY_OFF' },
  { code: 'DOM', title: 'DOM', description: 'Maternity day off', category: 'DAY_OFF' },
  { code: 'DOP', title: 'DOP', description: 'Opposite period - Day off', category: 'DAY_OFF' },
  { code: 'DOPR', title: 'DOPR', description: 'Reprogrammed Opposite period - Day off', category: 'DAY_OFF' },
  { code: 'DR', title: 'DR', description: 'Folga Pedida', category: 'DAY_OFF' },
  { code: 'DRC', title: 'DRC', description: 'Couple requested day off', category: 'DAY_OFF' },
  { code: 'DS', title: 'DS', description: 'Student day off - Folga Universidade', category: 'DAY_OFF' },
  { code: 'DSVD', title: 'DSVD', description: 'Flight security off', category: 'GROUND_DUTY' },
  { code: 'DTRN', title: 'DTRN', description: 'Disponível para treinamento', category: 'GROUND_DUTY' },
  { code: 'DW', title: 'DW', description: 'Folga Social', category: 'DAY_OFF' },
  { code: 'EFB', title: 'EFB', description: 'Electronic Flight Bag', category: 'GROUND_DUTY' },
  { code: 'EMER', title: 'EMER', description: 'EAD - Emergências Gerais', category: 'GROUND_DUTY' },
  { code: 'EMG', title: 'EMG', description: 'Emergency workshop', category: 'GROUND_DUTY' },
  { code: 'EMG320', title: 'EMG320', description: 'Emergências Gerais A320 Periódico', category: 'GROUND_DUTY' },
  { code: 'EMG777', title: 'EMG777', description: 'Emergências Gerais B777 Periódico', category: 'GROUND_DUTY' },
  { code: 'EMG_SS', title: 'EMG_SS', description: 'Emergency workshop', category: 'GROUND_DUTY' },
  { code: 'ENS', title: 'ENS', description: 'Instruction', category: 'GROUND_DUTY' },
  { code: 'EQP', title: 'EQP', description: 'Equipment revalidation', category: 'GROUND_DUTY' },
  { code: 'EQRH_JJ', title: 'EQRH_JJ', description: 'E-learning QRH', category: 'GROUND_DUTY' },
  { code: 'ETOP_JJ', title: 'ETOP_JJ', description: 'Operação prolongada c/ bimotor', category: 'GROUND_DUTY' },
  { code: 'EXT_JJ', title: 'EXT_JJ', description: 'International Simulator JJ', category: 'SIMULATOR' },
  { code: 'FCH', title: 'FCH', description: 'Formation of examinator', category: 'GROUND_DUTY' },
  { code: 'FCI', title: 'FCI', description: 'Formation of CSM', category: 'GROUND_DUTY' },
  { code: 'FCN', title: 'FCN', description: 'Curso Chefe de Cabine', category: 'GROUND_DUTY' },
  { code: 'FFS-BRA', title: 'FFS-BRA', description: 'Full Flight Simulator CAE', category: 'SIMULATOR' },
  { code: 'FLYS', title: 'FLYS', description: 'E-learning Flysmart', category: 'GROUND_DUTY' },
  { code: 'FMF', title: 'FMF', description: 'Acompanhamento médico de familiares', category: 'DAY_MARKER' },
  { code: 'FOLGA', title: 'FOLGA', description: 'Day off', category: 'DAY_OFF' },
  { code: 'FRAS', title: 'FRAS', description: 'Phraseology', category: 'GROUND_DUTY' },
  { code: 'FTD-BRA', title: 'FTD-BRA', description: 'FTD CAE', category: 'SIMULATOR' },
  { code: 'FTG', title: 'FTG', description: 'Fatigue', category: 'GROUND_DUTY' },
  { code: 'FUEL', title: 'FUEL', description: 'Smart Fuel', category: 'GROUND_DUTY' },
  { code: 'GE787', title: 'GE787', description: 'Differences RR/GE B787 engines', category: 'GROUND_DUTY' },
  { code: 'GRM', title: 'GRM', description: 'Ground Movement', category: 'TRANSPORT' },
  { code: 'HSB', title: 'HSB', description: 'Sobreaviso / Home Stand By', category: 'STANDBY' },
  { code: 'HSB-ADM', title: 'HSB-ADM', description: 'Home Stand by ADM', category: 'STANDBY' },
  { code: 'HSB1', title: 'HSB1', description: 'Home Stand by 1', category: 'STANDBY' },
  { code: 'HSB2', title: 'HSB2', description: 'Home Stand by 2', category: 'STANDBY' },
  { code: 'HSB_ADM', title: 'HSB_ADM', description: 'Home Stand by ADM', category: 'STANDBY' },
  { code: 'HSBD', title: 'HSBD', description: 'Home Stand by delay', category: 'STANDBY' },
  { code: 'HSBE', title: 'HSBE', description: 'Sobreaviso / Home Stand By Extra', category: 'STANDBY' },
  { code: 'HUD', title: 'HUD', description: 'Head-Up Display', category: 'GROUND_DUTY' },
  { code: 'I320', title: 'I320', description: 'A320 initial training', category: 'GROUND_DUTY' },
  { code: 'I767', title: 'I767', description: 'I767 initial training', category: 'GROUND_DUTY' },
  { code: 'I777', title: 'I777', description: 'I777 initial training', category: 'GROUND_DUTY' },
  { code: 'I787', title: 'I787', description: 'I787 initial training', category: 'GROUND_DUTY' },
  { code: 'IA320', title: 'IA320', description: 'Initial Equipment', category: 'GROUND_DUTY' },
  { code: 'IB77', title: 'IB77', description: 'Initial Equipment', category: 'GROUND_DUTY' },
  { code: 'IB78', title: 'IB78', description: 'Initial Equipment', category: 'GROUND_DUTY' },
  { code: 'ICFI', title: 'ICFI', description: 'CFI instructor', category: 'DAY_MARKER' },
  { code: 'ICPER', title: 'ICPER', description: 'Cargas Perigosas Inicial', category: 'GROUND_DUTY' },
  { code: 'ICPT', title: 'ICPT', description: 'Instrutor CPT', category: 'GROUND_DUTY' },
  { code: 'ICRM', title: 'ICRM', description: 'CRM instructor', category: 'GROUND_DUTY' },
  { code: 'IEMG320', title: 'IEMG320', description: 'Emergências Gerais A320 Inicial', category: 'GROUND_DUTY' },
  { code: 'IEMG777', title: 'IEMG777', description: 'Emergências Gerais B777 Inicial', category: 'GROUND_DUTY' },
  { code: 'IEMG787', title: 'IEMG787', description: 'Emergências Gerais B787 Inicial', category: 'GROUND_DUTY' },
  { code: 'IEQP', title: 'IEQP', description: 'Initial Equipment', category: 'GROUND_DUTY' },
  { code: 'ILF_SS', title: 'ILF_SS', description: 'Instrutor LOFT - GRU', category: 'GROUND_DUTY' },
  { code: 'ILOF-M3', title: 'ILOF-M3', description: 'Instrutor LOFT - GRU', category: 'GROUND_DUTY' },
  { code: 'ILOF_JJ', title: 'ILOF_JJ', description: 'Instrutor LOFT - GRU', category: 'SIMULATOR' },
  { code: 'IMCK320', title: 'IMCK320', description: 'Mock-up A320 Inicial', category: 'GROUND_DUTY' },
  { code: 'IMCK777', title: 'IMCK777', description: 'Mock-up B777 Inicial', category: 'GROUND_DUTY' },
  { code: 'IMET', title: 'IMET', description: 'Instr Meteorologia Inicial', category: 'GROUND_DUTY' },
  { code: 'INSS', title: 'INSS', description: 'INSS - Afastamento previdenciário', category: 'DAY_MARKER' },
  { code: 'IP320', title: 'IP320', description: 'Performance A320 Inicial', category: 'GROUND_DUTY' },
  { code: 'IP777', title: 'IP777', description: 'Performance B777 Inicial', category: 'GROUND_DUTY' },
  { code: 'IP787', title: 'IP787', description: 'Performance B787 Inicial', category: 'GROUND_DUTY' },
  { code: 'IPAD', title: 'IPAD', description: 'Curso iPad', category: 'GROUND_DUTY' },
  { code: 'IREG', title: 'IREG', description: 'Regulamentos Inicial', category: 'GROUND_DUTY' },
  { code: 'IS777', title: 'IS777', description: 'Inicial equipamento B777', category: 'GROUND_DUTY' },
  { code: 'IS787', title: 'IS787', description: 'Inicial equipamento B787', category: 'GROUND_DUTY' },
  { code: 'ISAFE', title: 'ISAFE', description: 'Safety Inicial', category: 'GROUND_DUTY' },
  { code: 'ISEGI', title: 'ISEGI', description: 'Segurança da Informação Inicial', category: 'GROUND_DUTY' },
  { code: 'ISGSO', title: 'ISGSO', description: 'Sistema de Gestão de Segurança Operacional Inicial', category: 'GROUND_DUTY' },
  { code: 'ISI_SS', title: 'ISI_SS', description: 'Instrutor Simulador - GRU', category: 'GROUND_DUTY' },
  { code: 'ISIM-M3', title: 'ISIM-M3', description: 'Instrutor Simulador - GRU', category: 'SIMULATOR' },
  { code: 'ISIM_JJ', title: 'ISIM_JJ', description: 'Instrutor Simulador - GRU', category: 'SIMULATOR' },
  { code: 'ISIM_LA', title: 'ISIM_LA', description: 'Instructor Simulator LA', category: 'SIMULATOR' },
  { code: 'ITEOP', title: 'ITEOP', description: 'Temas Operacionais Inicial', category: 'GROUND_DUTY' },
  { code: 'JI', title: 'JI', description: 'Interrupção de jornada', category: 'DAY_MARKER' },
  { code: 'JIJ', title: 'JIJ', description: 'Interrupção de jornada justificada', category: 'DAY_MARKER' },
  { code: 'JIS', title: 'JIS', description: 'Interrupção de jornada por doença', category: 'DAY_MARKER' },
  { code: 'LC', title: 'LC', description: 'Calamity leave', category: 'DAY_MARKER' },
  { code: 'LCH', title: 'LCH', description: 'Court Hearing Licence', category: 'DAY_MARKER' },
  { code: 'LENG', title: 'LENG', description: 'Test Language English', category: 'GROUND_DUTY' },
  { code: 'LEP', title: 'LEP', description: 'Paid leave', category: 'DAY_MARKER' },
  { code: 'LF', title: 'LF', description: 'Father leave', category: 'DAY_MARKER' },
  { code: 'LFRE', title: 'LFRE', description: 'Test Language French', category: 'GROUND_DUTY' },
  { code: 'LFS', title: 'LFS', description: 'Safety Call', category: 'DAY_MARKER' },
  { code: 'LGER', title: 'LGER', description: 'Test Language German', category: 'GROUND_DUTY' },
  { code: 'LGPD', title: 'LGPD', description: 'EAD - Lei Geral de Proteção de Dados', category: 'GROUND_DUTY' },
  { code: 'LGPD_M3', title: 'LGPD_M3', description: 'E-learning Lei Geral de Proteção de Dados', category: 'GROUND_DUTY' },
  { code: 'LIS', title: 'LIS', description: '????', category: 'OTHER' },
  { code: 'LITA', title: 'LITA', description: 'Test Language Italian', category: 'GROUND_DUTY' },
  { code: 'LNP', title: 'LNP', description: 'Non paid leave', category: 'DAY_MARKER' },
  { code: 'LOE_JJ', title: 'LOE_JJ', description: 'Simulator AQP JJ', category: 'SIMULATOR' },
  { code: 'LOE_M3', title: 'LOE_M3', description: 'Simulator AQP M3', category: 'SIMULATOR' },
  { code: 'LOFT_JJ', title: 'LOFT_JJ', description: 'LOFT Simulator JJ', category: 'SIMULATOR' },
  { code: 'LOFT_M3', title: 'LOFT_M3', description: 'LOFT Simulator M3', category: 'GROUND_DUTY' },
  { code: 'LOFTI', title: 'LOFTI', description: 'LOFT Tradicional', category: 'SIMULATOR' },
  { code: 'LP', title: 'LP', description: 'Pregnant leave', category: 'DAY_MARKER' },
  { code: 'LSNA', title: 'LSNA', description: 'SNA leave', category: 'DAY_MARKER' },
  { code: 'LSPA', title: 'LSPA', description: 'Test Language Spanish', category: 'GROUND_DUTY' },
  { code: 'LVO', title: 'LVO', description: 'Low Visibility Operations', category: 'GROUND_DUTY' },
  { code: 'LW', title: 'LW', description: 'Wedding leave', category: 'DAY_MARKER' },
  { code: 'M320', title: 'M320', description: 'Check A320', category: 'GROUND_DUTY' },
  { code: 'M32F', title: 'M32F', description: 'Check de Competências', category: 'GROUND_DUTY' },
  { code: 'M767', title: 'M767', description: 'Annual competency check B767', category: 'GROUND_DUTY' },
  { code: 'M777', title: 'M777', description: 'Annual competency check B777', category: 'GROUND_DUTY' },
  { code: 'M787', title: 'M787', description: 'Annual competency check B787', category: 'GROUND_DUTY' },
  { code: 'MAE', title: 'MAE', description: 'Medical exam', category: 'GROUND_DUTY' },
  { code: 'MAR', title: 'MAR', description: '[Presencial] Marinharia', category: 'GROUND_DUTY' },
  { code: 'MCK', title: 'MCK', description: 'Presencial - Mock-up de emergências', category: 'GROUND_DUTY' },
  { code: 'MCK320', title: 'MCK320', description: 'Mock-up A320 Periódico', category: 'GROUND_DUTY' },
  { code: 'MCK_SS', title: 'MCK_SS', description: 'Emergency mockup', category: 'GROUND_DUTY' },
  { code: 'ME', title: 'ME', description: 'Medical Exam - Exame Médico', category: 'GROUND_DUTY' },
  { code: 'MET', title: 'MET', description: 'Meteorology', category: 'GROUND_DUTY' },
  { code: 'MET_SS', title: 'MET_SS', description: 'Meteorology', category: 'GROUND_DUTY' },
  { code: 'METNB', title: 'METNB', description: 'IFR - NB Meteorology', category: 'GROUND_DUTY' },
  { code: 'METWB', title: 'METWB', description: 'IFR - WB Meteorology', category: 'GROUND_DUTY' },
  { code: 'MT', title: 'MT', description: 'Meeting - Reunião', category: 'MEETING' },
  { code: 'MT_GUIDE', title: 'MT_GUIDE', description: 'Guidance Meeting', category: 'MEETING' },
  { code: 'MTC', title: 'MTC', description: 'Chief meeting', category: 'MEETING' },
  { code: 'MV_JJ', title: 'MV_JJ', description: 'Manouver Validation Session - Simulator JJ', category: 'SIMULATOR' },
  { code: 'MV_M3', title: 'MV_M3', description: 'Simulator M3', category: 'GROUND_DUTY' },
  { code: 'NCF', title: 'NCF', description: 'No Show Funeral', category: 'DAY_MARKER' },
  { code: 'NEO2', title: 'NEO2', description: 'A320 Neo training', category: 'GROUND_DUTY' },
  { code: 'NPO', title: 'NPO', description: '[Online FoxSystem] Regulamentos', category: 'GROUND_DUTY' },
  { code: 'NR17-JJ', title: 'NR17-JJ', description: 'NR17-Ergonomia', category: 'GROUND_DUTY' },
  { code: 'NR17_JJ', title: 'NR17_JJ', description: 'NR17-Ergonomia', category: 'GROUND_DUTY' },
  { code: 'NS', title: 'NS', description: 'Não comparecimento', category: 'DAY_MARKER' },
  { code: 'NSC', title: 'NSC', description: 'Folga Chefe de Cabine', category: 'DAY_MARKER' },
  { code: 'NSJ', title: 'NSJ', description: 'Justified no show', category: 'DAY_MARKER' },
  { code: 'NSP', title: 'NSP', description: 'Published no show', category: 'DAY_MARKER' },
  { code: 'NSS', title: 'NSS', description: 'Study no show', category: 'DAY_MARKER' },
  { code: 'OFF', title: 'OFF', description: 'Extensão de Repouso', category: 'DAY_MARKER' },
  { code: 'ONTR', title: 'ONTR', description: 'Online training', category: 'GROUND_DUTY' },
  { code: 'OOF', title: 'OOF', description: 'Out of flight', category: 'DAY_MARKER' },
  { code: 'OP', title: 'OP', description: 'Operando', category: 'OTHER' },
  { code: 'OPC', title: 'OPC', description: 'Administrativo eventual copiloto', category: 'GROUND_DUTY' },
  { code: 'OPCT', title: 'OPCT', description: 'Operations Training available', category: 'SIMULATOR' },
  { code: 'OPE', title: 'OPE', description: 'Comandante eventual para operações', category: 'DAY_MARKER' },
  { code: 'OPR', title: 'OPR', description: 'Operations', category: 'GROUND_DUTY' },
  { code: 'OPT', title: 'OPT', description: 'Operations Part time', category: 'DAY_MARKER' },
  { code: 'OUT', title: 'OUT', description: 'Demissão', category: 'DAY_MARKER' },
  { code: 'P767', title: 'P767', description: 'B767 Performance Training', category: 'GROUND_DUTY' },
  { code: 'P777', title: 'P777', description: 'B777 Performance Training', category: 'GROUND_DUTY' },
  { code: 'P787', title: 'P787', description: 'B787 Performance Training', category: 'GROUND_DUTY' },
  { code: 'PABE-BRA', title: 'PABE-BRA', description: 'Training PABE', category: 'GROUND_DUTY' },
  { code: 'PASS', title: 'PASS', description: 'Document renewal - Passport', category: 'GROUND_DUTY' },
  { code: 'PBN', title: 'PBN', description: 'Navigation performance', category: 'GROUND_DUTY' },
  { code: 'PBNS_JJ', title: 'PBNS_JJ', description: 'PBN Simulator JJ', category: 'SIMULATOR' },
  { code: 'PERIOPR', title: 'PERIOPR', description: 'Acompanhamento de perícia trabalhista (presencial)', category: 'GROUND_DUTY' },
  { code: 'PID', title: 'PID', description: '[Presencial] Passageiro Indisciplinado', category: 'GROUND_DUTY' },
  { code: 'PRA', title: 'PRA', description: 'Reprovação Aula', category: 'OTHER' },
  { code: 'PROA', title: 'PROA', description: 'Pró Ajuda', category: 'GROUND_DUTY' },
  { code: 'PROA-JJ', title: 'PROA-JJ', description: '[Online FoxSystem] Pró Ajuda', category: 'GROUND_DUTY' },
  { code: 'PROA_JJ', title: 'PROA_JJ', description: 'Pró Ajuda', category: 'GROUND_DUTY' },
  { code: 'PS', title: 'PS', description: 'Trip Extra Remunerado', category: 'TRANSPORT' },
  { code: 'PSE', title: 'PSE', description: 'Commuting (Extra Não Remunerado)', category: 'TRANSPORT' },
  { code: 'PSO', title: 'PSO', description: '[Presencial] Primeiros Socorros', category: 'GROUND_DUTY' },
  { code: 'PSOO', title: 'PSOO', description: '[Online FoxSystem] Primeiros Socorros', category: 'GROUND_DUTY' },
  { code: 'PTRNG', title: 'PTRNG', description: 'Pending Training', category: 'GROUND_DUTY' },
  { code: 'R320', title: 'R320', description: 'Revalidação - A320', category: 'GROUND_DUTY' },
  { code: 'R767', title: 'R767', description: 'Periodic B767', category: 'GROUND_DUTY' },
  { code: 'R777', title: 'R777', description: 'Periodic B777', category: 'GROUND_DUTY' },
  { code: 'R778', title: 'R778', description: 'Periodic B777 and B787', category: 'GROUND_DUTY' },
  { code: 'R787', title: 'R787', description: 'Periodic B787', category: 'GROUND_DUTY' },
  { code: 'RCFI', title: 'RCFI', description: 'Instructor recycle', category: 'GROUND_DUTY' },
  { code: 'REC', title: 'REC', description: 'Re standard', category: 'SIMULATOR' },
  { code: 'REC1-BR', title: 'REC1-BR', description: 'Periodic training simulator 1', category: 'SIMULATOR' },
  { code: 'REC2-BR', title: 'REC2-BR', description: 'Periodic training simulator 2', category: 'GROUND_DUTY' },
  { code: 'REC_JJ', title: 'REC_JJ', description: 'Recurrent Simulator JJ', category: 'SIMULATOR' },
  { code: 'REG', title: 'REG', description: 'IFR Regulations', category: 'GROUND_DUTY' },
  { code: 'REG_SS', title: 'REG_SS', description: 'IFR Regulations', category: 'GROUND_DUTY' },
  { code: 'REGNB', title: 'REGNB', description: 'IFR - NB Regulations', category: 'GROUND_DUTY' },
  { code: 'REGWB', title: 'REGWB', description: 'IFR - WB Regulations', category: 'GROUND_DUTY' },
  { code: 'REST', title: 'REST', description: 'Repouso pós jornada', category: 'DAY_MARKER' },
  { code: 'REV320', title: 'REV320', description: 'Revisão Equipamento A320', category: 'GROUND_DUTY' },
  { code: 'REVA', title: 'REVA', description: 'Treinamento de Serviços, Presencial', category: 'GROUND_DUTY' },
  { code: 'REXP', title: 'REXP', description: 'Checker recycle', category: 'GROUND_DUTY' },
  { code: 'RNP_JJ', title: 'RNP_JJ', description: 'RNP Simulator JJ', category: 'SIMULATOR' },
  { code: 'RP32', title: 'RP32', description: 'Check failure A320', category: 'GROUND_DUTY' },
  { code: 'RPB6', title: 'RPB6', description: 'Check failure B767', category: 'GROUND_DUTY' },
  { code: 'RPB7', title: 'RPB7', description: 'Check failure B777', category: 'GROUND_DUTY' },
  { code: 'RPB8', title: 'RPB8', description: 'Check failure B787', category: 'GROUND_DUTY' },
  { code: 'RSOB-JJ', title: 'RSOB-JJ', description: '[Online FoxSystem] Sobrevivência na Selva', category: 'GROUND_DUTY' },
  { code: 'RSOB_JJ', title: 'RSOB_JJ', description: 'Sobrevivência', category: 'GROUND_DUTY' },
  { code: 'RTAI', title: 'RTAI', description: 'Traffic Revalidation', category: 'GROUND_DUTY' },
  { code: 'RTIS1', title: 'RTIS1', description: 'Technical operational training', category: 'GROUND_DUTY' },
  { code: 'RTIS2', title: 'RTIS2', description: 'Technical operational training', category: 'GROUND_DUTY' },
  { code: 'RVSM', title: 'RVSM', description: 'Reduced Vertical Separation Minimum', category: 'GROUND_DUTY' },
  { code: 'S320', title: 'S320', description: 'A320 equipment', category: 'GROUND_DUTY' },
  { code: 'S320_SS', title: 'S320_SS', description: 'A320 equipment', category: 'GROUND_DUTY' },
  { code: 'S777', title: 'S777', description: 'Equipamento B777', category: 'GROUND_DUTY' },
  { code: 'SAED', title: 'SAED', description: 'Saúde Aeroespacial', category: 'DAY_MARKER' },
  { code: 'SAER', title: 'SAER', description: 'Saúde Aeroespacial', category: 'DAY_MARKER' },
  { code: 'SAFE', title: 'SAFE', description: 'IFR Safety', category: 'GROUND_DUTY' },
  { code: 'SAFE_SS', title: 'SAFE_SS', description: 'IFR Safety', category: 'GROUND_DUTY' },
  { code: 'SAFENB', title: 'SAFENB', description: 'IFR - Safety NB', category: 'GROUND_DUTY' },
  { code: 'SEC', title: 'SEC', description: 'AVSEC on-line', category: 'GROUND_DUTY' },
  { code: 'SEG', title: 'SEG', description: 'Operational security', category: 'GROUND_DUTY' },
  { code: 'SEGI_JJ', title: 'SEGI_JJ', description: '[Online FoxSystem] Segurança da Informação', category: 'GROUND_DUTY' },
  { code: 'SFTY', title: 'SFTY', description: 'Safety - Segurança de Voo', category: 'DAY_MARKER' },
  { code: 'SGSO', title: 'SGSO', description: '[Online FoxSystem] SGSO', category: 'GROUND_DUTY' },
  { code: 'SICA', title: 'SICA', description: 'Sick ambulatory', category: 'DAY_MARKER' },
  { code: 'SICK', title: 'SICK', description: 'Dispensa Médica', category: 'DAY_MARKER' },
  { code: 'SICK_CVD', title: 'SICK_CVD', description: 'Dispensa Médica COVID', category: 'DAY_MARKER' },
  { code: 'SIM_JJ', title: 'SIM_JJ', description: 'Simulator JJ', category: 'SIMULATOR' },
  { code: 'SIM_M3', title: 'SIM_M3', description: 'Simulator M3', category: 'SIMULATOR' },
  { code: 'SIMREC', title: 'SIMREC', description: 'Experiência Recente', category: 'SIMULATOR' },
  { code: 'SIMST-BR', title: 'SIMST-BR', description: 'Periodic training AQP Special Tracking', category: 'SIMULATOR' },
  { code: 'SOP', title: 'SOP', description: 'Standard Operational Procedures', category: 'GROUND_DUTY' },
  { code: 'SREC-BR', title: 'SREC-BR', description: 'Experiência recente', category: 'SIMULATOR' },
  { code: 'SREC-JJ', title: 'SREC-JJ', description: 'Special Recurrent Simulator JJ', category: 'GROUND_DUTY' },
  { code: 'SS320', title: 'SS320', description: 'Special A320 equipment', category: 'GROUND_DUTY' },
  { code: 'SSIM-JJ', title: 'SSIM-JJ', description: 'Special Simulator JJ', category: 'SIMULATOR' },
  { code: 'STEOP', title: 'STEOP', description: 'Special Operational themes', category: 'GROUND_DUTY' },
  { code: 'SUPP-BRA', title: 'SUPP-BRA', description: 'Support Pilot', category: 'SIMULATOR' },
  { code: 'SUSP', title: 'SUSP', description: 'Suspensão', category: 'DAY_MARKER' },
  { code: 'SW', title: 'SW', description: 'Afastamento por Acidente de trabalho', category: 'DAY_MARKER' },
  { code: 'SWAP', title: 'SWAP', description: 'Flight Swap - Troca entre tripulantes', category: 'DAY_MARKER' },
  { code: 'TAI', title: 'TAI', description: 'Air traffic Nat/Int', category: 'GROUND_DUTY' },
  { code: 'TAINB', title: 'TAINB', description: 'International Air Traffic NB', category: 'GROUND_DUTY' },
  { code: 'TCAS', title: 'TCAS', description: 'Unknown Code', category: 'SIMULATOR' },
  { code: 'TEMP', title: 'TEMP', description: 'Temporary duty', category: 'DAY_MARKER' },
  { code: 'TEOP', title: 'TEOP', description: 'Operational themes', category: 'GROUND_DUTY' },
  { code: 'TEOP_SS', title: 'TEOP_SS', description: 'Operational themes', category: 'GROUND_DUTY' },
  { code: 'TEOPNB', title: 'TEOPNB', description: 'Operational themes', category: 'GROUND_DUTY' },
  { code: 'TFD1', title: 'TFD1', description: 'Initial Fatigue + Safety case', category: 'GROUND_DUTY' },
  { code: 'TFD2', title: 'TFD2', description: 'Initial Fatigue', category: 'GROUND_DUTY' },
  { code: 'TFTG', title: 'TFTG', description: 'Fatigue Training', category: 'GROUND_DUTY' },
  { code: 'TQSC_JJ', title: 'TQSC_JJ', description: 'Treinamento Operação QSC', category: 'GROUND_DUTY' },
  { code: 'TRAM', title: 'TRAM', description: 'Mountain area training', category: 'GROUND_DUTY' },
  { code: 'TRAM_JJ', title: 'TRAM_JJ', description: 'Montains Area Training', category: 'GROUND_DUTY' },
  { code: 'TRNG', title: 'TRNG', description: 'Trainings', category: 'GROUND_DUTY' },
  { code: 'TRNP_JJ', title: 'TRNP_JJ', description: 'Treinamento RNP-AR', category: 'GROUND_DUTY' },
  { code: 'TRTO', title: 'TRTO', description: 'Technical operational training', category: 'GROUND_DUTY' },
  { code: 'TSDU_JJ', title: 'TSDU_JJ', description: 'Treinamento Operação SDU', category: 'GROUND_DUTY' },
  { code: 'TSFC_JJ', title: 'TSFC_JJ', description: 'Treinamento Periódico Safety Case', category: 'GROUND_DUTY' },
  { code: 'TSFC_M3', title: 'TSFC_M3', description: 'Safety Case Training', category: 'GROUND_DUTY' },
  { code: 'TST', title: 'TST', description: 'Proficiency Language Test', category: 'GROUND_DUTY' },
  { code: 'UB', title: 'UB', description: 'Union Blank', category: 'DAY_MARKER' },
  { code: 'UPRT', title: 'UPRT', description: 'Upset Recovery', category: 'GROUND_DUTY' },
  { code: 'VA32', title: 'VA32', description: 'Initial Visit', category: 'GROUND_DUTY' },
  { code: 'VAC_CVD', title: 'VAC_CVD', description: 'JJ Reação da vacina', category: 'GROUND_DUTY' },
  { code: 'VB77', title: 'VB77', description: 'Initial Visit', category: 'GROUND_DUTY' },
  { code: 'VB78', title: 'VB78', description: 'Initial Visit', category: 'GROUND_DUTY' },
  { code: 'VC', title: 'VC', description: 'Férias', category: 'DAY_OFF' },
  { code: 'VUSA', title: 'VUSA', description: 'Day to renewal VISA', category: 'OTHER' },
  { code: 'WAIT_CVD', title: 'WAIT_CVD', description: 'JJ aguardando resultado exame COVID-19', category: 'GROUND_DUTY' },
  { code: 'WCCF', title: 'WCCF', description: 'Without license - Sem CMA', category: 'DAY_MARKER' },
  { code: 'WCHT', title: 'WCHT', description: 'Without licence - Sem CHT', category: 'OTHER' },
  { code: 'WEB', title: 'WEB', description: 'Online training', category: 'GROUND_DUTY' },
  { code: 'WEB4', title: 'WEB4', description: 'Corporate online training', category: 'GROUND_DUTY' },
  { code: 'WEB5', title: 'WEB5', description: 'Conduct code and pró ajuda and SGSO', category: 'GROUND_DUTY' },
  { code: 'WEXC', title: 'WEXC', description: 'Accredited Examiners Workshop', category: 'GROUND_DUTY' },
  { code: 'WINDSH', title: 'WINDSH', description: 'Windshear', category: 'GROUND_DUTY' },
  { code: 'WRADAR', title: 'WRADAR', description: 'Radar', category: 'GROUND_DUTY' },
  { code: 'XANAC-BR', title: 'XANAC-BR', description: 'Check ANAC - Examinador', category: 'SIMULATOR' },
  { code: 'XSIE_JJ', title: 'XSIE_JJ', description: 'Checador para simulador no exterior', category: 'SIMULATOR' },
  { code: 'XSIM-M3', title: 'XSIM-M3', description: 'Checador simulador - GRU', category: 'SIMULATOR' },
  { code: 'XSIM_JJ', title: 'XSIM_JJ', description: 'Checador simulador - GRU', category: 'SIMULATOR' },
  { code: 'ZFTT', title: 'ZFTT', description: 'Zero Flight Time', category: 'SIMULATOR' },
];

function keyOf(value: string): string {
  return String(value || '').toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, '').trim();
}

// CrewCheck v10.8.106 — auditoria de escala: CRM, CRMB e CRMBSB são a mesma programação.
// Mantém um único código canônico para evitar cards e descrições duplicadas no painel.
function canonicalRosterKey(value: string): string {
  const key = keyOf(value);
  if (key === 'CRMB' || key === 'CRMBSB' || key === 'CRM-BSB' || key === 'CRM_BSB') return 'CRM';
  return key;
}

function aliasKeys(code: string): string[] {
  const key = keyOf(code);
  const out = new Set([key]);
  out.add(key.replace(/-/g, '_'));
  out.add(key.replace(/_/g, '-'));
  return Array.from(out);
}

const map = new Map<string, RosterCodeDefinition>();
for (const def of rawRosterCodes) {
  for (const alias of aliasKeys(def.code)) map.set(alias, def);
}

export const ROSTER_CODES: Record<string, RosterCodeDefinition> = Object.fromEntries(
  rawRosterCodes.map((def) => [def.code, def])
);

export const ROSTER_CODE_LIST = rawRosterCodes.map((def) => def.code);

export function normalizeRosterCode(value: string | null | undefined): string {
  return canonicalRosterKey(value || '');
}

export function getRosterCodeDefinition(value: string | null | undefined): RosterCodeDefinition | null {
  const key = canonicalRosterKey(value || '');
  if (!key) return null;
  return map.get(key) || map.get(key.replace(/-/g, '_')) || map.get(key.replace(/_/g, '-')) || null;
}

export function isKnownRosterCode(value: string | null | undefined): boolean {
  return Boolean(getRosterCodeDefinition(value));
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const rosterCodePattern = rawRosterCodes
  .flatMap((def) => aliasKeys(def.code))
  .sort((a, b) => b.length - a.length)
  .map(regexEscape)
  .join('|');

export const ROSTER_CODE_REGEX_SOURCE = rosterCodePattern;
export const ROSTER_CODE_REGEX = new RegExp(`\\b(${rosterCodePattern})\\b`, 'gi');

export function findRosterCodes(text: string | null | undefined): string[] {
  const source = String(text || '').toUpperCase().replace(/[–—]/g, '-');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of source.matchAll(new RegExp(`\\b(${rosterCodePattern})\\b`, 'gi'))) {
    const def = getRosterCodeDefinition(match[1]);
    const code = def?.code || keyOf(match[1]);
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

export function categoryLabel(category: RosterCodeCategory): string {
  switch (category) {
    case 'DAY_OFF': return 'Day Off';
    case 'DAY_MARKER': return 'Day Marker';
    case 'SIMULATOR': return 'Simulator';
    case 'TRANSPORT': return 'Transport';
    case 'RESERVE': return 'Reserve';
    case 'STANDBY': return 'Standby';
    case 'MEDICAL': return 'Medical';
    case 'MEETING': return 'Meeting';
    case 'GROUND_DUTY': return 'Ground Duty';
    default: return 'Duty';
  }
}

export function rosterStatus(category: RosterCodeCategory): string {
  switch (category) {
    case 'DAY_OFF': return 'Day Off';
    case 'DAY_MARKER': return 'Marker';
    case 'SIMULATOR': return 'Simulator';
    case 'TRANSPORT': return 'Transport';
    case 'RESERVE': return 'Reserve';
    case 'STANDBY': return 'Standby';
    case 'MEDICAL': return 'Medical';
    case 'MEETING': return 'Meeting';
    case 'GROUND_DUTY': return 'Training';
    default: return 'Duty';
  }
}

export function eventTextFromRosterCode(code: string): { activity: string; subtitle: string; code: string; typeLabel: string; status: string } | null {
  const def = getRosterCodeDefinition(code);
  if (!def) return null;
  return {
    activity: def.title,
    subtitle: def.description,
    code: def.code,
    typeLabel: categoryLabel(def.category),
    status: rosterStatus(def.category),
  };
}

export function rosterCodeTitle(code: string): string {
  const def = getRosterCodeDefinition(code);
  return def ? `${def.title} / ${def.description}` : code;
}
