// CrewCheck v12.5.61 — Hotéis da empresa + academias por plano
// Arquivo consolidado para manter o ZIP completo enxuto.

export type CrewCheckGymProviderPlan = 'wellhub' | 'smartfit' | 'both';

export type CrewCheckCompanyHotel = {
  id: string;
  name: string;
  airportCode: string;
  airportCode2?: string;
  airports: string[];
  city: string;
  stateProvince?: string;
  country: string;
  source: 'company-list';
  active: boolean;
};

export const CREWCHECK_HOTELS_GYMS_VERSION = '12.5.61';
export const CREWCHECK_GYM_PROVIDER_PLAN_STORAGE_KEY = 'crewcheck:gym-provider-plan:v1';
export const CREWCHECK_GYM_MAX_DISTANCE_STORAGE_KEY = 'crewcheck:gym-max-distance-km:v1';
export const CREWCHECK_HOTEL_REFERENCE_STORAGE_KEY = 'crewcheck:hotel-reference:v1';

export const CREWCHECK_GYM_PROVIDER_PLANS: Array<{ value: CrewCheckGymProviderPlan; label: string; description: string }> = [
  { value: 'wellhub', label: 'Wellhub', description: 'Exibe somente academias e parceiros compatíveis com Wellhub.' },
  { value: 'smartfit', label: 'Smart Fit', description: 'Exibe somente unidades Smart Fit para quem usa acesso direto, sem Wellhub.' },
  { value: 'both', label: 'Wellhub + Smart Fit', description: 'Exibe academias Wellhub e Smart Fit no mesmo resultado.' },
];

export const CREWCHECK_COMPANY_HOTELS: CrewCheckCompanyHotel[] = [
  {
    "id": "BCN-001",
    "name": "abba Garden hotel",
    "airportCode": "BCN",
    "airportCode2": "",
    "airports": [
      "BCN"
    ],
    "city": "Barcelona",
    "stateProvince": "",
    "country": "ES",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MAD-002",
    "name": "Abba Madrid Hotel",
    "airportCode": "MAD",
    "airportCode2": "",
    "airports": [
      "MAD"
    ],
    "city": "Madrid",
    "stateProvince": "",
    "country": "ES",
    "source": "company-list",
    "active": true
  },
  {
    "id": "PUJ-003",
    "name": "AC Hotel by Marriott Punta Cana",
    "airportCode": "PUJ",
    "airportCode2": "",
    "airports": [
      "PUJ"
    ],
    "city": "Punta Cana",
    "stateProvince": "(PUJ) Punta Cana",
    "country": "DO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MIA-004",
    "name": "AC Hotel Miami Dadeland",
    "airportCode": "MIA",
    "airportCode2": "",
    "airports": [
      "MIA"
    ],
    "city": "Miami",
    "stateProvince": "FL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BVB-005",
    "name": "Aipana Plaza Hotel",
    "airportCode": "BVB",
    "airportCode2": "",
    "airports": [
      "BVB"
    ],
    "city": "Boa Vista",
    "stateProvince": "",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MIA-006",
    "name": "Aloft Miami Dadeland",
    "airportCode": "MIA",
    "airportCode2": "",
    "airports": [
      "MIA"
    ],
    "city": "Miami",
    "stateProvince": "FL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MIA-007",
    "name": "Aloft Miami Doral",
    "airportCode": "MIA",
    "airportCode2": "",
    "airports": [
      "MIA"
    ],
    "city": "Doral",
    "stateProvince": "FL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MCP-008",
    "name": "Amapá Hotel",
    "airportCode": "MCP",
    "airportCode2": "",
    "airports": [
      "MCP"
    ],
    "city": "Macapá",
    "stateProvince": "Amapá",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ARI-009",
    "name": "Antay Hotel & Spa",
    "airportCode": "ARI",
    "airportCode2": "",
    "airports": [
      "ARI"
    ],
    "city": "Arica",
    "stateProvince": "XV Región de Arica y Parinacota",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MXP-010",
    "name": "Atlantic Hotel",
    "airportCode": "MXP",
    "airportCode2": "",
    "airports": [
      "MXP"
    ],
    "city": "Milan",
    "stateProvince": "",
    "country": "IT",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LHR-011",
    "name": "Atrium Hotel Heathrow",
    "airportCode": "LHR",
    "airportCode2": "",
    "airports": [
      "LHR"
    ],
    "city": "Faltham",
    "stateProvince": "England",
    "country": "GB",
    "source": "company-list",
    "active": true
  },
  {
    "id": "AKL-012",
    "name": "Auckland City Hotel",
    "airportCode": "AKL",
    "airportCode2": "",
    "airports": [
      "AKL"
    ],
    "city": "Auckland",
    "stateProvince": "CBD",
    "country": "NZ",
    "source": "company-list",
    "active": true
  },
  {
    "id": "UDI-013",
    "name": "B&B Hotels Uberlândia",
    "airportCode": "UDI",
    "airportCode2": "",
    "airports": [
      "UDI"
    ],
    "city": "Uberlândia",
    "stateProvince": "Minas Gerais",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SCL-014",
    "name": "Best Western Premier Marina Las Condes",
    "airportCode": "SCL",
    "airportCode2": "",
    "airports": [
      "SCL"
    ],
    "city": "Santiago",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LAX-015",
    "name": "Biltmore Los Angeles",
    "airportCode": "LAX",
    "airportCode2": "",
    "airports": [
      "LAX"
    ],
    "city": "Los Angeles",
    "stateProvince": "CA",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BOG-016",
    "name": "Bogota Plaza Hotel",
    "airportCode": "BOG",
    "airportCode2": "",
    "airports": [
      "BOG"
    ],
    "city": "Bogotá",
    "stateProvince": "",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GRU-017",
    "name": "Bristol International Airport Hotel Guarulhos",
    "airportCode": "GRU",
    "airportCode2": "",
    "airports": [
      "GRU"
    ],
    "city": "Guarulhos",
    "stateProvince": "Sao Paulo",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "FLN-018",
    "name": "Castelmar Hotel",
    "airportCode": "FLN",
    "airportCode2": "",
    "airports": [
      "FLN"
    ],
    "city": "Florianópolis",
    "stateProvince": "SC",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CDG-019",
    "name": "City Residence Paris CDG Airport",
    "airportCode": "CDG",
    "airportCode2": "",
    "airports": [
      "CDG"
    ],
    "city": "Roissy-en-France",
    "stateProvince": "",
    "country": "FR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GYN-020",
    "name": "Comfort Hotel Goiânia",
    "airportCode": "GYN",
    "airportCode2": "",
    "airports": [
      "GYN"
    ],
    "city": "Goiânia",
    "stateProvince": "Goiás",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GRU-021",
    "name": "Comfort Hotel Guarulhos",
    "airportCode": "GRU",
    "airportCode2": "",
    "airports": [
      "GRU"
    ],
    "city": "Jardim Santa Lidia",
    "stateProvince": "SP",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BOS-022",
    "name": "Comfort Inn & Suites Boston Logan Airport",
    "airportCode": "BOS",
    "airportCode2": "",
    "airports": [
      "BOS"
    ],
    "city": "Boston",
    "stateProvince": "ME",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "AUA-023",
    "name": "Courtyard by Marriott Aruba Resort",
    "airportCode": "AUA",
    "airportCode2": "",
    "airports": [
      "AUA"
    ],
    "city": "Palm Beach",
    "stateProvince": "Noord",
    "country": "AW",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LAX-024",
    "name": "Courtyard by Marriott Los Angeles LAX/Hawthorne",
    "airportCode": "LAX",
    "airportCode2": "",
    "airports": [
      "LAX"
    ],
    "city": "Hawthorne",
    "stateProvince": "CA",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "PMC-025",
    "name": "Courtyard by Marriott Puerto Montt",
    "airportCode": "PMC",
    "airportCode2": "",
    "airports": [
      "PMC"
    ],
    "city": "Puerto Montt",
    "stateProvince": "N/A",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MCO-026",
    "name": "Courtyard Marriott Village Lake Buena Vista",
    "airportCode": "MCO",
    "airportCode2": "",
    "airports": [
      "MCO"
    ],
    "city": "Orlando",
    "stateProvince": "FL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MAD-027",
    "name": "Crowne Plaza Madrid Centre Retiro, an IHG Hotel",
    "airportCode": "MAD",
    "airportCode2": "",
    "airports": [
      "MAD"
    ],
    "city": "Madrid",
    "stateProvince": "",
    "country": "ES",
    "source": "company-list",
    "active": true
  },
  {
    "id": "RAO-028",
    "name": "Dan Inn Hotel Ribeirão Preto",
    "airportCode": "RAO",
    "airportCode2": "",
    "airports": [
      "RAO"
    ],
    "city": "Ribeirão Preto",
    "stateProvince": "Brasil",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CJC-029",
    "name": "Diego de Almagro Calama Alto Loa",
    "airportCode": "CJC",
    "airportCode2": "",
    "airports": [
      "CJC"
    ],
    "city": "Calama",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BBA-030",
    "name": "Diego De Almagro Coyhaique",
    "airportCode": "BBA",
    "airportCode2": "",
    "airports": [
      "BBA"
    ],
    "city": "Coyhaique",
    "stateProvince": "Region de Aysen",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "EZE-031",
    "name": "Dolmen Hotel",
    "airportCode": "EZE",
    "airportCode2": "",
    "airports": [
      "EZE"
    ],
    "city": "Buenos Aires",
    "stateProvince": "Cdad. Autónoma de Buenos Aires",
    "country": "AR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "AEP-032",
    "name": "Dolmen Hotel",
    "airportCode": "AEP",
    "airportCode2": "",
    "airports": [
      "AEP"
    ],
    "city": "Buenos Aires",
    "stateProvince": "Cdad. Autónoma de Buenos Aires",
    "country": "AR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LAX-033",
    "name": "Doubletree Hotel Carson Civic Plaza",
    "airportCode": "LAX",
    "airportCode2": "",
    "airports": [
      "LAX"
    ],
    "city": "Los Angeles",
    "stateProvince": "CA",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "FTE-034",
    "name": "Esplendor by Wyndham El Calafate",
    "airportCode": "FTE",
    "airportCode2": "",
    "airports": [
      "FTE"
    ],
    "city": "El Calafate",
    "stateProvince": "Santa Cruz",
    "country": "AR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CGH-035",
    "name": "Esuites Congonhas by Atlantica",
    "airportCode": "CGH",
    "airportCode2": "",
    "airports": [
      "CGH"
    ],
    "city": "São Paulo",
    "stateProvince": "SP",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MEX-036",
    "name": "Fiesta Americana Viaducto Aeropuerto",
    "airportCode": "MEX",
    "airportCode2": "",
    "airports": [
      "MEX"
    ],
    "city": "Mexico City",
    "stateProvince": "Iztacalco",
    "country": "MX",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CUN-037",
    "name": "Four Points by Sheraton Cancun",
    "airportCode": "CUN",
    "airportCode2": "",
    "airports": [
      "CUN"
    ],
    "city": "Cancun",
    "stateProvince": "Quintana Roo",
    "country": "MX",
    "source": "company-list",
    "active": true
  },
  {
    "id": "AJU-038",
    "name": "Go Inn Aracaju",
    "airportCode": "AJU",
    "airportCode2": "",
    "airports": [
      "AJU"
    ],
    "city": "Aracaju",
    "stateProvince": "SE",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BRU-039",
    "name": "Golden Tulip Keyser Breda",
    "airportCode": "BRU",
    "airportCode2": "",
    "airports": [
      "BRU"
    ],
    "city": "Breda",
    "stateProvince": "Noord-Brabant",
    "country": "NL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MAB-040",
    "name": "Golden Ville Hotel",
    "airportCode": "MAB",
    "airportCode2": "",
    "airports": [
      "MAB"
    ],
    "city": "Nova Marabá",
    "stateProvince": "PA",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "DBX-041",
    "name": "Hampton by Hilton Dubai Airport",
    "airportCode": "DBX",
    "airportCode2": "DXB",
    "airports": [
      "DBX",
      "DXB"
    ],
    "city": "Dubai",
    "stateProvince": "Dubai",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "FRA-042",
    "name": "Hampton by Hilton Frankfurt Airport",
    "airportCode": "FRA",
    "airportCode2": "",
    "airports": [
      "FRA"
    ],
    "city": "Frankfurt",
    "stateProvince": "",
    "country": "DE",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SCL-043",
    "name": "Hampton by Hilton Santiago Las Condes",
    "airportCode": "SCL",
    "airportCode2": "",
    "airports": [
      "SCL"
    ],
    "city": "Las Condes",
    "stateProvince": "Región Metropolitana",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SID-044",
    "name": "Hilton Cabo Verde Sal Resort",
    "airportCode": "SID",
    "airportCode2": "",
    "airports": [
      "SID"
    ],
    "city": "Santa Maria",
    "stateProvince": "Sal",
    "country": "CV",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GYE-045",
    "name": "Hilton Colón Guayaquil",
    "airportCode": "GYE",
    "airportCode2": "",
    "airports": [
      "GYE"
    ],
    "city": "Guayaquil",
    "stateProvince": "",
    "country": "EC",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BAQ-046",
    "name": "Hilton Garden Inn Barranquilla",
    "airportCode": "BAQ",
    "airportCode2": "",
    "airports": [
      "BAQ"
    ],
    "city": "Riomar",
    "stateProvince": "Atlántico",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MCZ-047",
    "name": "Hilton Garden Inn Maceio",
    "airportCode": "MCZ",
    "airportCode2": "",
    "airports": [
      "MCZ"
    ],
    "city": "Maceió",
    "stateProvince": "",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LAX-048",
    "name": "Holiday Inn Los Angeles Gateway - Torrance",
    "airportCode": "LAX",
    "airportCode2": "",
    "airports": [
      "LAX"
    ],
    "city": "Torrance",
    "stateProvince": "CA",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MAO-049",
    "name": "Holiday Inn Manaus",
    "airportCode": "MAO",
    "airportCode2": "",
    "airports": [
      "MAO"
    ],
    "city": "Manaus",
    "stateProvince": "Amazonas",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "FCO-050",
    "name": "Holiday Inn Rome Eur Parco Dei Medici",
    "airportCode": "FCO",
    "airportCode2": "",
    "airports": [
      "FCO"
    ],
    "city": "Rome",
    "stateProvince": "RM",
    "country": "IT",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SYD-051",
    "name": "Holiday Inn Sydney Airport",
    "airportCode": "SYD",
    "airportCode2": "",
    "airports": [
      "SYD"
    ],
    "city": "Mascot",
    "stateProvince": "NSW",
    "country": "AU",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ANF-052",
    "name": "Hotel Antofagasta",
    "airportCode": "ANF",
    "airportCode2": "",
    "airports": [
      "ANF"
    ],
    "city": "Antofagasta",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "PUQ-053",
    "name": "Hotel Cabo De Hornos",
    "airportCode": "PUQ",
    "airportCode2": "",
    "airports": [
      "PUQ"
    ],
    "city": "Punta Arenas",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CTG-054",
    "name": "Hotel Caribe by Faranda Grand",
    "airportCode": "CTG",
    "airportCode2": "",
    "airports": [
      "CTG"
    ],
    "city": "Cartagena de Indias",
    "stateProvince": "Bolivar",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CWB-055",
    "name": "Hotel Cassino Tower Curitiba Aeroporto By Nacional Inn",
    "airportCode": "CWB",
    "airportCode2": "",
    "airports": [
      "CWB"
    ],
    "city": "Águas Belas",
    "stateProvince": "PR",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CLO-056",
    "name": "Hotel Dann Carlton",
    "airportCode": "CLO",
    "airportCode2": "",
    "airports": [
      "CLO"
    ],
    "city": "Cali",
    "stateProvince": "Valle",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "IQQ-057",
    "name": "Hotel Gavina Sens",
    "airportCode": "IQQ",
    "airportCode2": "",
    "airports": [
      "IQQ"
    ],
    "city": "Iquique",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MEX-058",
    "name": "Hotel Geneve",
    "airportCode": "MEX",
    "airportCode2": "",
    "airports": [
      "MEX"
    ],
    "city": "Mexico",
    "stateProvince": "",
    "country": "MX",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ANF-059",
    "name": "Hotel Hampton By Hilton Antofagasta",
    "airportCode": "ANF",
    "airportCode2": "",
    "airports": [
      "ANF"
    ],
    "city": "Antofagasta",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "IQQ-060",
    "name": "Hotel Ibis Budget Iquique",
    "airportCode": "IQQ",
    "airportCode2": "",
    "airports": [
      "IQQ"
    ],
    "city": "Iquique",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GIG-061",
    "name": "Hotel Intercity Porto Maravilha",
    "airportCode": "GIG",
    "airportCode2": "",
    "airports": [
      "GIG"
    ],
    "city": "Rio de Janeiro",
    "stateProvince": "Rio de Janeiro",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GRU-062",
    "name": "Hotel Intercity Tatuapé",
    "airportCode": "GRU",
    "airportCode2": "",
    "airports": [
      "GRU"
    ],
    "city": "Tatuapé",
    "stateProvince": "São Paulo",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CGR-063",
    "name": "Hotel Jandaia",
    "airportCode": "CGR",
    "airportCode2": "",
    "airports": [
      "CGR"
    ],
    "city": "Campo Grande",
    "stateProvince": "MT",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MDE-064",
    "name": "Hotel Lagoon Llanogrande",
    "airportCode": "MDE",
    "airportCode2": "",
    "airports": [
      "MDE"
    ],
    "city": "Rionegro",
    "stateProvince": "Antioquia",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "POA-065",
    "name": "Hotel Master Cosmopolitan",
    "airportCode": "POA",
    "airportCode2": "",
    "airports": [
      "POA"
    ],
    "city": "Moinhos de Vento",
    "stateProvince": "RS",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CCP-066",
    "name": "Hotel Mercure Concepción",
    "airportCode": "CCP",
    "airportCode2": "",
    "airports": [
      "CCP"
    ],
    "city": "Concepción",
    "stateProvince": "Región del Bio Bio",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "STM-067",
    "name": "Hotel Mirante da Ilha",
    "airportCode": "STM",
    "airportCode2": "",
    "airports": [
      "STM"
    ],
    "city": "Santarém",
    "stateProvince": "PR",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MDE-068",
    "name": "Hotel Movich Las Lomas",
    "airportCode": "MDE",
    "airportCode2": "",
    "airports": [
      "MDE"
    ],
    "city": "Rionegro",
    "stateProvince": "Antioquia",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SJP-069",
    "name": "Hotel Nacional Distributed by Intercity",
    "airportCode": "SJP",
    "airportCode2": "",
    "airports": [
      "SJP"
    ],
    "city": "Sao Jose do Rio Preto",
    "stateProvince": "SP",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "QHS-070",
    "name": "Hotel Nassau Breda",
    "airportCode": "QHS",
    "airportCode2": "",
    "airports": [
      "QHS"
    ],
    "city": "Breda",
    "stateProvince": "",
    "country": "NL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BPS-071",
    "name": "Hotel Solar do Imperador",
    "airportCode": "BPS",
    "airportCode2": "",
    "airports": [
      "BPS"
    ],
    "city": "Porto Seguro",
    "stateProvince": "Bahia",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "IPC-072",
    "name": "Hotel Taha Tai",
    "airportCode": "IPC",
    "airportCode2": "",
    "airports": [
      "IPC"
    ],
    "city": "Isla de Pascua",
    "stateProvince": "",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "VVI-073",
    "name": "Hotel Terranova Suites",
    "airportCode": "VVI",
    "airportCode2": "",
    "airports": [
      "VVI"
    ],
    "city": "SANTA CRUZ DE LA SIERRA",
    "stateProvince": "Bolivia",
    "country": "BO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BAQ-074",
    "name": "Hotel Wyndham Garden",
    "airportCode": "BAQ",
    "airportCode2": "",
    "airports": [
      "BAQ"
    ],
    "city": "Barranquilla",
    "stateProvince": "Atlántico",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CLO-075",
    "name": "Hoteles Dann Carlton Cali",
    "airportCode": "CLO",
    "airportCode2": "",
    "airports": [
      "CLO"
    ],
    "city": "Cali",
    "stateProvince": "Valle",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "COR-076",
    "name": "Howard Johnson Hotel & Suites La Cañada",
    "airportCode": "COR",
    "airportCode2": "",
    "airports": [
      "COR"
    ],
    "city": "Cordoba",
    "stateProvince": "Cordoba",
    "country": "AR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ASU-077",
    "name": "HUB Hotel Asunción",
    "airportCode": "ASU",
    "airportCode2": "",
    "airports": [
      "ASU"
    ],
    "city": "Asunción",
    "stateProvince": "Central",
    "country": "PY",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ORD-078",
    "name": "Hyatt Regency O'Hare Chicago",
    "airportCode": "ORD",
    "airportCode2": "",
    "airports": [
      "ORD"
    ],
    "city": "Rosemont",
    "stateProvince": "IL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MBJ-079",
    "name": "Iberotar Selection Rose Hall Suites",
    "airportCode": "MBJ",
    "airportCode2": "",
    "airports": [
      "MBJ"
    ],
    "city": "Montego Bay",
    "stateProvince": "St. James",
    "country": "JM",
    "source": "company-list",
    "active": true
  },
  {
    "id": "FOR-080",
    "name": "Ibis Fortaleza Centro de Eventos",
    "airportCode": "FOR",
    "airportCode2": "",
    "airports": [
      "FOR"
    ],
    "city": "Fortaleza",
    "stateProvince": "Ceará",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "IMP-081",
    "name": "ibis Imperatriz",
    "airportCode": "IMP",
    "airportCode2": "",
    "airports": [
      "IMP"
    ],
    "city": "Imperatriz",
    "stateProvince": "Maranhão",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "JPA-082",
    "name": "Ibis João Pessoa",
    "airportCode": "JPA",
    "airportCode2": "",
    "airports": [
      "JPA"
    ],
    "city": "João Pessoa",
    "stateProvince": "Paraíba",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "JDO-083",
    "name": "Ibis Juazeiro do Norte",
    "airportCode": "JDO",
    "airportCode2": "",
    "airports": [
      "JDO"
    ],
    "city": "Juazeiro do Norte",
    "stateProvince": "Ceara",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MGF-084",
    "name": "ibis Maringa",
    "airportCode": "MGF",
    "airportCode2": "",
    "airports": [
      "MGF"
    ],
    "city": "Maringa",
    "stateProvince": "PR",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "NVT-085",
    "name": "ibis Navegantes Itajai",
    "airportCode": "NVT",
    "airportCode2": "",
    "airports": [
      "NVT"
    ],
    "city": "Fazenda",
    "stateProvince": "SC",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "PMW-086",
    "name": "Ibis Palmas Avenida JK",
    "airportCode": "PMW",
    "airportCode2": "",
    "airports": [
      "PMW"
    ],
    "city": "Palmas",
    "stateProvince": "",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "QSC-087",
    "name": "ibis Sao Carlos",
    "airportCode": "QSC",
    "airportCode2": "",
    "airports": [
      "QSC"
    ],
    "city": "Parque Faber Castell II",
    "stateProvince": "SP",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SLZ-088",
    "name": "Ibis São Luís",
    "airportCode": "SLZ",
    "airportCode2": "",
    "airports": [
      "SLZ"
    ],
    "city": "São Luís",
    "stateProvince": "Maranhão",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "OPS-089",
    "name": "ibis Sinop",
    "airportCode": "OPS",
    "airportCode2": "",
    "airports": [
      "OPS"
    ],
    "city": "Sinop",
    "stateProvince": "Mato Grosso",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BEL-090",
    "name": "Ibis Styles Belem Hangar",
    "airportCode": "BEL",
    "airportCode2": "",
    "airports": [
      "BEL"
    ],
    "city": "Belem",
    "stateProvince": "Para",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CWB-091",
    "name": "ibis Styles Curitiba Aeroporto",
    "airportCode": "CWB",
    "airportCode2": "",
    "airports": [
      "CWB"
    ],
    "city": "Águas Belas",
    "stateProvince": "PR",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GYN-092",
    "name": "Ibis Styles Goiania Marista",
    "airportCode": "GYN",
    "airportCode2": "",
    "airports": [
      "GYN"
    ],
    "city": "Goiania",
    "stateProvince": "Goias",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "VDC-093",
    "name": "Ibis Vitoria da Conquista",
    "airportCode": "VDC",
    "airportCode2": "",
    "airports": [
      "VDC"
    ],
    "city": "Vitória da Conquista",
    "stateProvince": "Bahia",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "TLV-094",
    "name": "Indigo Tel Aviv",
    "airportCode": "TLV",
    "airportCode2": "",
    "airports": [
      "TLV"
    ],
    "city": "Ramat Gan",
    "stateProvince": "",
    "country": "IL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "FLN-095",
    "name": "Intercity Florianópolis",
    "airportCode": "FLN",
    "airportCode2": "",
    "airports": [
      "FLN"
    ],
    "city": "Florianópolis",
    "stateProvince": "SC",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "POA-096",
    "name": "Intercity Hotel Canoas",
    "airportCode": "POA",
    "airportCode2": "",
    "airports": [
      "POA"
    ],
    "city": "Canoas",
    "stateProvince": "Rio Grande do Sul",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BSB-097",
    "name": "Intercity Led Águas Claras",
    "airportCode": "BSB",
    "airportCode2": "",
    "airports": [
      "BSB"
    ],
    "city": "Brasilia",
    "stateProvince": "DF",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MCZ-098",
    "name": "Intercity Maceió",
    "airportCode": "MCZ",
    "airportCode2": "",
    "airports": [
      "MCZ"
    ],
    "city": "Maceió",
    "stateProvince": "AL",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SDU-099",
    "name": "Intercity Porto Maravilha",
    "airportCode": "SDU",
    "airportCode2": "",
    "airports": [
      "SDU"
    ],
    "city": "Rio de Janeiro",
    "stateProvince": "Rio de Janeiro",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MAO-100",
    "name": "Intercity Premium Manaus",
    "airportCode": "MAO",
    "airportCode2": "",
    "airports": [
      "MAO"
    ],
    "city": "Manau",
    "stateProvince": "AM",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "RAO-101",
    "name": "Intercity Ribeirão Preto",
    "airportCode": "RAO",
    "airportCode2": "",
    "airports": [
      "RAO"
    ],
    "city": "Ribeirão Preto",
    "stateProvince": "SP",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SSA-102",
    "name": "Intercity Salvador Aeroporto",
    "airportCode": "SSA",
    "airportCode2": "",
    "airports": [
      "SSA"
    ],
    "city": "Salvador",
    "stateProvince": "BA",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LDB-103",
    "name": "JK Premium Hotel e Eventos",
    "airportCode": "LDB",
    "airportCode2": "",
    "airports": [
      "LDB"
    ],
    "city": "Londrina",
    "stateProvince": "PR",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CUZ-104",
    "name": "José Antonio Cusco",
    "airportCode": "CUZ",
    "airportCode2": "",
    "airports": [
      "CUZ"
    ],
    "city": "Cusco",
    "stateProvince": "Cusco",
    "country": "PE",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BRC-105",
    "name": "Kenton Palace Bariloche",
    "airportCode": "BRC",
    "airportCode2": "",
    "airports": [
      "BRC"
    ],
    "city": "San Carlos de Bariloche",
    "stateProvince": "Río Negro",
    "country": "AR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CNF-106",
    "name": "Lagoon Prime Hotel",
    "airportCode": "CNF",
    "airportCode2": "",
    "airports": [
      "CNF"
    ],
    "city": "LAGOA SANTA",
    "stateProvince": "MINAS GERAIS",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "JOI-107",
    "name": "Le Canard Joinville",
    "airportCode": "JOI",
    "airportCode2": "",
    "airports": [
      "JOI"
    ],
    "city": "Joinville",
    "stateProvince": "Santa Catarina",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CNF-108",
    "name": "Linx Hotel Confins International Airport",
    "airportCode": "CNF",
    "airportCode2": "",
    "airports": [
      "CNF"
    ],
    "city": "Confins",
    "stateProvince": "Minas Gerais",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GIG-109",
    "name": "Linx Hotel Internacional Airport Galeão Rio de Janeiro",
    "airportCode": "GIG",
    "airportCode2": "",
    "airports": [
      "GIG"
    ],
    "city": "Rio de Janeiro",
    "stateProvince": "RJ",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "JFK-110",
    "name": "Long Island Marriott",
    "airportCode": "JFK",
    "airportCode2": "",
    "airports": [
      "JFK"
    ],
    "city": "Uniondale",
    "stateProvince": "NY",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "REC-111",
    "name": "Mar Hotel Conventions",
    "airportCode": "REC",
    "airportCode2": "",
    "airports": [
      "REC"
    ],
    "city": "Recife",
    "stateProvince": "PE",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "FLN-112",
    "name": "Mercure Florianópolis",
    "airportCode": "FLN",
    "airportCode2": "",
    "airports": [
      "FLN"
    ],
    "city": "Itacorubi",
    "stateProvince": "SC",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GRU-113",
    "name": "Mercure Guarulhos",
    "airportCode": "GRU",
    "airportCode2": "",
    "airports": [
      "GRU"
    ],
    "city": "Guarulhos",
    "stateProvince": "Sao Paulo",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GIG-114",
    "name": "Mercure Rio de Janeiro Barra da Tijuca",
    "airportCode": "GIG",
    "airportCode2": "",
    "airports": [
      "GIG"
    ],
    "city": "Rio de Janeiro",
    "stateProvince": "Rio de Janeiro",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "THE-115",
    "name": "Metropolitan Hotel",
    "airportCode": "THE",
    "airportCode2": "",
    "airports": [
      "THE"
    ],
    "city": "Teresina",
    "stateProvince": "Brasil",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "RBR-116",
    "name": "Nobile Suítes Gran Lumni",
    "airportCode": "RBR",
    "airportCode2": "",
    "airports": [
      "RBR"
    ],
    "city": "Rio Branco",
    "stateProvince": "Acre",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MEL-117",
    "name": "Novotel Central Melbourne",
    "airportCode": "MEL",
    "airportCode2": "",
    "airports": [
      "MEL"
    ],
    "city": "Melbourne",
    "stateProvince": "VIC",
    "country": "AU",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SDU-118",
    "name": "Novotel RJ Porto Atlântico",
    "airportCode": "SDU",
    "airportCode2": "",
    "airports": [
      "SDU"
    ],
    "city": "Rio de Janeiro",
    "stateProvince": "Rio de Janeiro",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SCL-119",
    "name": "Novotel Santiago Vitacura",
    "airportCode": "SCL",
    "airportCode2": "",
    "airports": [
      "SCL"
    ],
    "city": "Vitacura",
    "stateProvince": "Región Metropolitana",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CGB-120",
    "name": "Paiáguas Palace Hotel",
    "airportCode": "CGB",
    "airportCode2": "",
    "airports": [
      "CGB"
    ],
    "city": "Cuiabá",
    "stateProvince": "MT",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MAD-121",
    "name": "PCM Forum Alcalá",
    "airportCode": "MAD",
    "airportCode2": "",
    "airports": [
      "MAD"
    ],
    "city": "Madrid",
    "stateProvince": "MD",
    "country": "ES",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ADZ-122",
    "name": "Portobelo Plaza de las Américas",
    "airportCode": "ADZ",
    "airportCode2": "",
    "airports": [
      "ADZ"
    ],
    "city": "San Andres Isla",
    "stateProvince": "San Andrés y Providencia",
    "country": "CO",
    "source": "company-list",
    "active": true
  },
  {
    "id": "JJD-123",
    "name": "Pousada Sol Nascente",
    "airportCode": "JJD",
    "airportCode2": "",
    "airports": [
      "JJD"
    ],
    "city": "Jijoca de Jericoacoara",
    "stateProvince": "ceara",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "NAT-124",
    "name": "Praiamar Arena",
    "airportCode": "NAT",
    "airportCode2": "",
    "airports": [
      "NAT"
    ],
    "city": "Lagoa Nova",
    "stateProvince": "RN",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SDU-125",
    "name": "Prodigy Hotel Santos Dumont Airport Rio de Janeiro",
    "airportCode": "SDU",
    "airportCode2": "",
    "airports": [
      "SDU"
    ],
    "city": "Rio de Janeiro",
    "stateProvince": "",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MIA-126",
    "name": "Pullman Miami Airport Hotel",
    "airportCode": "MIA",
    "airportCode2": "",
    "airports": [
      "MIA"
    ],
    "city": "Miami",
    "stateProvince": "FL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SCL-127",
    "name": "Pullman Santiago El Bosque",
    "airportCode": "SCL",
    "airportCode2": "",
    "airports": [
      "SCL"
    ],
    "city": "Las Condes",
    "stateProvince": "Región Metropolitana",
    "country": "CL",
    "source": "company-list",
    "active": true
  },
  {
    "id": "DSS-128",
    "name": "Radisson Hotel Dakar Diamniadio",
    "airportCode": "DSS",
    "airportCode2": "",
    "airports": [
      "DSS"
    ],
    "city": "Diamniadio",
    "stateProvince": "Senegal",
    "country": "SN",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LGG-129",
    "name": "Radisson Liege City Centre",
    "airportCode": "LGG",
    "airportCode2": "",
    "airports": [
      "LGG"
    ],
    "city": "Liège",
    "stateProvince": "Région Wallonne",
    "country": "BE",
    "source": "company-list",
    "active": true
  },
  {
    "id": "JNB-130",
    "name": "Radisson RED Johannesburg Rosebank",
    "airportCode": "JNB",
    "airportCode2": "",
    "airports": [
      "JNB"
    ],
    "city": "Johannesburg",
    "stateProvince": "GP",
    "country": "ZA",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GIG-131",
    "name": "Residence Inn by Marriott Barra da Tijuca Rio de Janeiro",
    "airportCode": "GIG",
    "airportCode2": "",
    "airports": [
      "GIG"
    ],
    "city": "Rio de Janeiro",
    "stateProvince": "",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "EZE-132",
    "name": "Rochester M Hotel",
    "airportCode": "EZE",
    "airportCode2": "",
    "airports": [
      "EZE"
    ],
    "city": "Buenos Aires",
    "stateProvince": "Buenos Aires",
    "country": "AR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "VCP-133",
    "name": "Royal Palm Tower Indaiatuba",
    "airportCode": "VCP",
    "airportCode2": "",
    "airports": [
      "VCP"
    ],
    "city": "Indaiatuba",
    "stateProvince": "São Paulo",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "SYD-134",
    "name": "Rydges Australia Square",
    "airportCode": "SYD",
    "airportCode2": "",
    "airports": [
      "SYD"
    ],
    "city": "Sydney",
    "stateProvince": "NSW",
    "country": "AU",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BSB-135",
    "name": "S4 Hotel",
    "airportCode": "BSB",
    "airportCode2": "",
    "airports": [
      "BSB"
    ],
    "city": "Brasilia",
    "stateProvince": "DF",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LIS-136",
    "name": "SANA Metropolitan Hotel",
    "airportCode": "LIS",
    "airportCode2": "",
    "airports": [
      "LIS"
    ],
    "city": "Lisboa",
    "stateProvince": "Portugal",
    "country": "PT",
    "source": "company-list",
    "active": true
  },
  {
    "id": "LIM-137",
    "name": "Sheraton Lima Hotel & Convention Center",
    "airportCode": "LIM",
    "airportCode2": "",
    "airports": [
      "LIM"
    ],
    "city": "Lima",
    "stateProvince": "Lima",
    "country": "PE",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MIA-138",
    "name": "Sheraton Miami Airport Hotel & Executive Meeting Center",
    "airportCode": "MIA",
    "airportCode2": "",
    "airports": [
      "MIA"
    ],
    "city": "Miami",
    "stateProvince": "FL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "PVH-139",
    "name": "Slaviero Essential Porto Velho",
    "airportCode": "PVH",
    "airportCode2": "",
    "airports": [
      "PVH"
    ],
    "city": "Porto Velho",
    "stateProvince": "Rondônia",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "JPA-140",
    "name": "Slaviero Hotel João Pessoa",
    "airportCode": "JPA",
    "airportCode2": "",
    "airports": [
      "JPA"
    ],
    "city": "Joao Pessoa",
    "stateProvince": "PB",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ATL-141",
    "name": "Sonesta Atlanta Airport North",
    "airportCode": "ATL",
    "airportCode2": "",
    "airports": [
      "ATL"
    ],
    "city": "Atlanta",
    "stateProvince": "GA",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MIA-142",
    "name": "Sonesta Select Miami Lakes",
    "airportCode": "MIA",
    "airportCode2": "",
    "airports": [
      "MIA"
    ],
    "city": "Miami Lakes",
    "stateProvince": "FL",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "PPT-143",
    "name": "Tahiti Ia Ora Beach Resort",
    "airportCode": "PPT",
    "airportCode2": "",
    "airports": [
      "PPT"
    ],
    "city": "Punaauia",
    "stateProvince": "Tahiti",
    "country": "PF",
    "source": "company-list",
    "active": true
  },
  {
    "id": "VIX-144",
    "name": "Transamerica Fit Vitoria Praia de Camburi",
    "airportCode": "VIX",
    "airportCode2": "",
    "airports": [
      "VIX"
    ],
    "city": "Jardim Camburi",
    "stateProvince": "ES",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "CNF-145",
    "name": "Transamerica Lagoa Santa",
    "airportCode": "CNF",
    "airportCode2": "",
    "airports": [
      "CNF"
    ],
    "city": "Confins",
    "stateProvince": "MG",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "BRU-146",
    "name": "Van Der Valk Hotel Brussels Airport",
    "airportCode": "BRU",
    "airportCode2": "",
    "airports": [
      "BRU"
    ],
    "city": "Brussels",
    "stateProvince": "Vlaams Gewest",
    "country": "BE",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MVD-147",
    "name": "Vivaldi Hotel Loft Punta Carretas",
    "airportCode": "MVD",
    "airportCode2": "",
    "airports": [
      "MVD"
    ],
    "city": "Montevideo",
    "stateProvince": "Departamento de Montevideo",
    "country": "UY",
    "source": "company-list",
    "active": true
  },
  {
    "id": "MAD-148",
    "name": "voco Madrid - Retiro by IHG",
    "airportCode": "MAD",
    "airportCode2": "",
    "airports": [
      "MAD"
    ],
    "city": "Madrid",
    "stateProvince": "",
    "country": "ES",
    "source": "company-list",
    "active": true
  },
  {
    "id": "IAD-149",
    "name": "Westin Tysons Corner",
    "airportCode": "IAD",
    "airportCode2": "",
    "airports": [
      "IAD"
    ],
    "city": "Dulles",
    "stateProvince": "VA",
    "country": "US",
    "source": "company-list",
    "active": true
  },
  {
    "id": "GRU-150",
    "name": "Wyndham Garden São Paulo Convention Nortel",
    "airportCode": "GRU",
    "airportCode2": "",
    "airports": [
      "GRU"
    ],
    "city": "São Paulo",
    "stateProvince": "SP",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "IGU-151",
    "name": "Wyndham Golden Foz Suites",
    "airportCode": "IGU",
    "airportCode2": "",
    "airports": [
      "IGU"
    ],
    "city": "Foz do Iguaçu",
    "stateProvince": "Paraná",
    "country": "BR",
    "source": "company-list",
    "active": true
  },
  {
    "id": "UIO-152",
    "name": "Wyndham Quito Airport",
    "airportCode": "UIO",
    "airportCode2": "",
    "airports": [
      "UIO"
    ],
    "city": "Quito",
    "stateProvince": "Pichincha",
    "country": "EC",
    "source": "company-list",
    "active": true
  },
  {
    "id": "ZAZ-153",
    "name": "Zentral Ave Hotel",
    "airportCode": "ZAZ",
    "airportCode2": "",
    "airports": [
      "ZAZ"
    ],
    "city": "Zaragoza",
    "stateProvince": "AR",
    "country": "ES",
    "source": "company-list",
    "active": true
  }
];

export function normalizeCrewCheckAirportCode(value?: string | null): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function normalizeCrewCheckGymProviderPlan(value?: string | null): CrewCheckGymProviderPlan {
  const clean = String(value || '').trim().toLowerCase();
  if (clean === 'wellhub' || clean === 'gympass') return 'wellhub';
  if (clean === 'smartfit' || clean === 'smart_fit' || clean === 'smart fit') return 'smartfit';
  return 'both';
}

export function getCrewCheckGymProviderPlan(): CrewCheckGymProviderPlan {
  try {
    return normalizeCrewCheckGymProviderPlan(window.localStorage.getItem(CREWCHECK_GYM_PROVIDER_PLAN_STORAGE_KEY));
  } catch {
    return 'both';
  }
}

export function setCrewCheckGymProviderPlan(plan: CrewCheckGymProviderPlan): CrewCheckGymProviderPlan {
  const normalized = normalizeCrewCheckGymProviderPlan(plan);
  try {
    window.localStorage.setItem(CREWCHECK_GYM_PROVIDER_PLAN_STORAGE_KEY, normalized);
    window.dispatchEvent(new CustomEvent('crewcheck:gym-provider-plan-changed', { detail: normalized }));
  } catch {}
  return normalized;
}

export function crewCheckGymProviderPlanLabel(plan?: string | null): string {
  const normalized = normalizeCrewCheckGymProviderPlan(plan);
  return CREWCHECK_GYM_PROVIDER_PLANS.find((item) => item.value === normalized)?.label || 'Wellhub + Smart Fit';
}

export function findCrewCheckCompanyHotelsByAirport(airportCode?: string | null): CrewCheckCompanyHotel[] {
  const code = normalizeCrewCheckAirportCode(airportCode);
  if (!code) return [];
  const list = typeof getCrewCheckCompanyHotelsSortedByLocality === 'function'
    ? getCrewCheckCompanyHotelsSortedByLocality()
    : CREWCHECK_COMPANY_HOTELS;
  return list.filter((hotel) => hotel.airports.map(normalizeCrewCheckAirportCode).includes(code));
}

export function searchCrewCheckCompanyHotels(query?: string | null): CrewCheckCompanyHotel[] {
  const q = String(query || '').trim().toLocaleLowerCase();
  if (!q) return CREWCHECK_COMPANY_HOTELS;
  return CREWCHECK_COMPANY_HOTELS.filter((hotel) => {
    const haystack = [
      hotel.name,
      hotel.airportCode,
      hotel.airportCode2,
      ...(hotel.airports || []),
      hotel.city,
      hotel.stateProvince,
      hotel.country,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return haystack.includes(q);
  });
}

export function getCrewCheckHotelLocalityLabel(hotel: CrewCheckCompanyHotel): string {
  const city = String(hotel?.city || '').trim();
  const state = String(hotel?.stateProvince || '').trim();
  const country = String(hotel?.country || '').trim();
  const airport = String(hotel?.airportCode || hotel?.airports?.[0] || '').trim();
  return [city, state, country].filter(Boolean).join(' · ') || airport || 'Localidade';
}

export function getCrewCheckCompanyHotelsSortedByLocality(): CrewCheckCompanyHotel[] {
  return [...CREWCHECK_COMPANY_HOTELS].sort((a, b) => {
    const aKey = `${getCrewCheckHotelLocalityLabel(a)} ${a.airportCode || ''} ${a.name || ''}`.toLocaleLowerCase();
    const bKey = `${getCrewCheckHotelLocalityLabel(b)} ${b.airportCode || ''} ${b.name || ''}`.toLocaleLowerCase();
    return aKey.localeCompare(bKey, 'pt-BR', { sensitivity: 'base' });
  });
}

export function findCrewCheckBestHotelForAirport(airportCode?: string | null): CrewCheckCompanyHotel | null {
  const code = normalizeCrewCheckAirportCode(airportCode);
  if (!code) return null;
  return getCrewCheckCompanyHotelsSortedByLocality().find((hotel) =>
    (hotel.airports || []).map(normalizeCrewCheckAirportCode).includes(code)
  ) || null;
}


export function crewCheckGymMatchesProviderPlan(gym: any, plan: CrewCheckGymProviderPlan = getCrewCheckGymProviderPlan()): boolean {
  const normalized = normalizeCrewCheckGymProviderPlan(plan);
  if (normalized === 'both') return true;
  const text = [
    gym?.provider,
    gym?.source,
    gym?.network,
    gym?.brand,
    gym?.name,
    gym?.title,
    ...(Array.isArray(gym?.providers) ? gym.providers : []),
    ...(Array.isArray(gym?.tags) ? gym.tags : []),
  ].filter(Boolean).join(' ').toLowerCase();
  if (normalized === 'wellhub') return ['wellhub','gympass','gympass_compat','selfit','pratique','bluefit','gaviões','gavioes','arena','formula','fórmula','bodytech','k2','v4','c4','bio ritmo','smart fit','smartfit'].some((item) => text.includes(item));
  if (normalized === 'smartfit') return text.includes('smart fit') || text.includes('smartfit');
  return true;
}

export function filterCrewCheckGymsByProviderPlan<T = any>(gyms: T[], plan: CrewCheckGymProviderPlan = getCrewCheckGymProviderPlan()): T[] {
  if (!Array.isArray(gyms)) return [];
  return gyms.filter((gym) => crewCheckGymMatchesProviderPlan(gym, plan));
}


export function getCrewCheckGymMaxDistanceKm(): number {
  try {
    const value = Number(localStorage.getItem(CREWCHECK_GYM_MAX_DISTANCE_STORAGE_KEY) || '5');
    return Number.isFinite(value) ? Math.max(1, Math.min(25, value)) : 5;
  } catch { return 5; }
}

export function setCrewCheckGymMaxDistanceKm(value: number): number {
  const normalized = Math.max(1, Math.min(25, Number(value) || 5));
  try { localStorage.setItem(CREWCHECK_GYM_MAX_DISTANCE_STORAGE_KEY, String(normalized)); } catch {}
  return normalized;
}

export function getCrewCheckHotelReferenceId(): string {
  try { return String(localStorage.getItem(CREWCHECK_HOTEL_REFERENCE_STORAGE_KEY) || ''); } catch { return ''; }
}

export function setCrewCheckHotelReferenceId(value: string): string {
  const id = String(value || '');
  try { localStorage.setItem(CREWCHECK_HOTEL_REFERENCE_STORAGE_KEY, id); } catch {}
  return id;
}

export function getCrewCheckHotelById(id?: string | null): CrewCheckCompanyHotel | null {
  const value = String(id || '').trim();
  if (!value) return null;
  return CREWCHECK_COMPANY_HOTELS.find((hotel) => hotel.id === value) || null;
}

export type CrewCheckLocalRating = { stars: number; note?: string; updatedAt: string };
const CREWCHECK_LOCAL_RATINGS_STORAGE_KEY = 'crewcheck:place-ratings:v1';
const CREWCHECK_LOCAL_FAVORITES_STORAGE_KEY = 'crewcheck:place-favorites:v1';

function readLocalJsonRecord<T = any>(key: string): Record<string, T> {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
}

export function getCrewCheckLocalPlaceRating(placeId: string): CrewCheckLocalRating | null {
  return readLocalJsonRecord<CrewCheckLocalRating>(CREWCHECK_LOCAL_RATINGS_STORAGE_KEY)[String(placeId || '')] || null;
}

export function setCrewCheckLocalPlaceRating(placeId: string, stars: number, note = ''): CrewCheckLocalRating {
  const ratings = readLocalJsonRecord<CrewCheckLocalRating>(CREWCHECK_LOCAL_RATINGS_STORAGE_KEY);
  const rating = { stars: Math.max(1, Math.min(5, Number(stars) || 5)), note: String(note || '').slice(0, 500), updatedAt: new Date().toISOString() };
  ratings[String(placeId || 'local')] = rating;
  try { localStorage.setItem(CREWCHECK_LOCAL_RATINGS_STORAGE_KEY, JSON.stringify(ratings)); } catch {}
  return rating;
}

export function isCrewCheckPlaceFavorite(placeId: string): boolean {
  return Boolean(readLocalJsonRecord<boolean>(CREWCHECK_LOCAL_FAVORITES_STORAGE_KEY)[String(placeId || '')]);
}

export function toggleCrewCheckPlaceFavorite(placeId: string): boolean {
  const favorites = readLocalJsonRecord<boolean>(CREWCHECK_LOCAL_FAVORITES_STORAGE_KEY);
  const id = String(placeId || 'local');
  favorites[id] = !favorites[id];
  try { localStorage.setItem(CREWCHECK_LOCAL_FAVORITES_STORAGE_KEY, JSON.stringify(favorites)); } catch {}
  return Boolean(favorites[id]);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char] || char));
}

function shouldShowCrewCheckHotelsGymsPanel(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();
    return params.get('hotelsGymsPanel') === '1' || path.includes('/results') && (params.get('view') === 'gym' || params.get('screen') === 'gym');
  } catch {
    return false;
  }
}

function findCrewCheckHotelsGymsMountTarget(): Element | null {
  const selectors = ['[data-crewcheck-settings]', '[data-page="settings"]', '[data-page="academias"]', '[data-page="hotels"]', '.cc-results-shell', 'main', '#root'];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return document.body;
}


function openCrewCheckHotelDetailsCard(hotelId: string, hotelName = ''): void {
  try {
    let modal = document.getElementById('crewcheck-hotel-details-modal');
    if (!modal) {
      modal = document.createElement('section');
      modal.id = 'crewcheck-hotel-details-modal';
      modal.className = 'cc-hotel-details-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="cc-hotel-details-backdrop" data-close="1"></div>
      <article class="cc-hotel-details-card">
        <button class="cc-hotel-details-close" data-close="1" type="button">×</button>
        <p class="cc-hg-eyebrow">Hotel da empresa</p>
        <h2>${escapeHtml(hotelName || 'Carregando hotel...')}</h2>
        <p class="cc-hg-muted">Buscando endereço, telefone e pontos próximos com TomTom.</p>
        <div class="cc-hotel-details-loading">Atualizando informações online…</div>
      </article>
    `;
    modal.querySelectorAll('[data-close]').forEach((item) => item.addEventListener('click', () => modal?.remove()));
    fetch(`/api/company-hotels/details?id=${encodeURIComponent(hotelId)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((payload) => {
        const details = payload?.details || {};
        const hotel = payload?.hotel || {};
        const title = details.name || hotel.name || hotelName || 'Hotel';
        const address = details.address || 'Endereço a confirmar';
        const phone = details.phone || 'Telefone a confirmar';
        const website = details.website || details.url || '';
        const mapsUrl = details.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} ${address}`)}`;
        const tomtomUrl = details.tomtomUrl || mapsUrl;
        const rating = payload?.rating || {};
        modal!.innerHTML = `
          <div class="cc-hotel-details-backdrop" data-close="1"></div>
          <article class="cc-hotel-details-card">
            <button class="cc-hotel-details-close" data-close="1" type="button">×</button>
            <p class="cc-hg-eyebrow">Hotel da empresa · ${escapeHtml(hotel.airportCode || '')}</p>
            <h2>${escapeHtml(title)}</h2>
            <div class="cc-hotel-info-grid">
              <div><span>Endereço</span><b>${escapeHtml(address)}</b></div>
              <div><span>Telefone</span><b>${escapeHtml(phone)}</b></div>
              <div><span>Avaliação CrewCheck</span><b>${rating?.average ? `${Number(rating.average).toFixed(2)} ★ · ${rating.count || 0} avaliação(ões)` : 'Ainda sem avaliações'}</b></div>
            </div>
            <div class="cc-hotel-actions">
              <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>
              <a href="${escapeHtml(tomtomUrl)}" target="_blank" rel="noreferrer">Abrir no TomTom</a>
              ${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noreferrer">Site</a>` : ''}
            </div>
            <p class="cc-hg-muted">Use este hotel como referência para rotina, academias e pontos próximos.</p>
          </article>
        `;
        modal!.querySelectorAll('[data-close]').forEach((item) => item.addEventListener('click', () => modal?.remove()));
      })
      .catch(() => {
        const card = modal?.querySelector('.cc-hotel-details-card');
        if (card) card.innerHTML += `<p class="cc-hg-muted">Não foi possível enriquecer este hotel agora. Tente novamente após configurar TomTom no Render.</p>`;
      });
  } catch {}
}


export function installCrewCheckHotelsGymsPanel(): void {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (document.getElementById('crewcheck-hotels-gyms-v125431-panel')) return;
    if (!shouldShowCrewCheckHotelsGymsPanel()) return;
    const target = findCrewCheckHotelsGymsMountTarget();
    if (!target) return;

    let selectedPlan = getCrewCheckGymProviderPlan();
    let query = '';
    const panel = document.createElement('section');
    panel.id = 'crewcheck-hotels-gyms-v125431-panel';
    panel.className = 'cc-hg-panel';

    const draw = () => {
      const list = searchCrewCheckCompanyHotels(query).sort((a, b) => `${getCrewCheckHotelLocalityLabel(a)} ${a.name}`.localeCompare(`${getCrewCheckHotelLocalityLabel(b)} ${b.name}`, 'pt-BR', { sensitivity: 'base' })).slice(0, 60);
      panel.innerHTML = `
        <div class="cc-hg-head">
          <div>
            <p class="cc-hg-eyebrow">CrewCheck v12.5.61</p>
            <h2 class="cc-hg-title">Hotéis da empresa e academias</h2>
            <p class="cc-hg-muted">Base com ${CREWCHECK_COMPANY_HOTELS.length} hotéis. Plano atual: <b>${escapeHtml(crewCheckGymProviderPlanLabel(selectedPlan))}</b>.</p>
          </div>
        </div>
        <div class="cc-hg-grid" role="group" aria-label="Plano de academias">
          ${CREWCHECK_GYM_PROVIDER_PLANS.map((item) => `
            <button type="button" class="cc-hg-option" data-plan="${item.value}" aria-pressed="${selectedPlan === item.value}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.description)}</span>
            </button>
          `).join('')}
        </div>
        <div class="cc-hg-search">
          <input type="search" value="${escapeHtml(query)}" placeholder="Buscar hotel por aeroporto, cidade, país ou nome..." aria-label="Buscar hotéis da empresa" />
        </div>
        <div class="cc-hg-list" aria-label="Lista de hotéis da empresa">
          ${list.map((hotel) => `
            <article class="cc-hg-card" data-hotel-id="${escapeHtml(hotel.id)}" role="button" tabindex="0">
              <b>${escapeHtml(hotel.name)}</b>
              <small>${escapeHtml(getCrewCheckHotelLocalityLabel(hotel))}</small>
              ${(hotel.airports || []).map((airport) => `<span class="cc-hg-pill">${escapeHtml(airport)}</span>`).join('')}
            </article>
          `).join('') || '<article class="cc-hg-card"><b>Nenhum hotel encontrado</b><small>Tente pesquisar pelo código IATA, cidade ou país.</small></article>'}
        </div>
      `;
      panel.querySelectorAll('[data-plan]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedPlan = setCrewCheckGymProviderPlan((button as HTMLElement).dataset.plan as CrewCheckGymProviderPlan);
          draw();
        });
      });
      const input = panel.querySelector('input');
      input?.addEventListener('input', () => {
        query = (input as HTMLInputElement).value;
        draw();
      });
      panel.querySelectorAll('[data-hotel-id]').forEach((card) => {
        card.addEventListener('click', () => {
          const id = (card as HTMLElement).dataset.hotelId || '';
          if (id) {
            setCrewCheckHotelReferenceId(id);
            window.dispatchEvent(new CustomEvent('crewcheck:hotel-reference', { detail: id }));
            openCrewCheckHotelDetailsCard(id, (card as HTMLElement).querySelector('b')?.textContent || '');
          }
        });
      });
    };

    draw();
    target.prepend(panel);
  } catch (error) {
    console.warn('[CrewCheck] painel de hotéis/academias protegido:', error);
  }
}

export function bootCrewCheckHotelsGymsPanel(): void {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const boot = () => {
      let tries = 0;
      const timer = window.setInterval(() => {
        tries += 1;
        installCrewCheckHotelsGymsPanel();
        if (document.getElementById('crewcheck-hotels-gyms-v125431-panel') || tries >= 10) window.clearInterval(timer);
      }, 650);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
    window.addEventListener('popstate', () => window.setTimeout(boot, 250));
    window.addEventListener('crewcheck:gym-provider-plan-changed', () => window.setTimeout(boot, 250));
  } catch {}
}


/* --------------------------------------------------------------------------
 * CrewCheck v12.5.46 — PassRider bridge seguro
 * -------------------------------------------------------------------------- */

// CrewCheck v12.5.46 — PassRider bridge seguro
// Integração inspirada no repositório público csima/passrider, sem copiar código-fonte.
// O repositório original é um servidor Go inicial para pesquisar voos via United Passrider.
// Por segurança/LGPD, este módulo não coleta nem armazena credenciais corporativas.

export const CREWCHECK_PASSRIDER_VERSION = '12.5.46';
export const CREWCHECK_PASSRIDER_PROFILE_KEY = 'crewcheck:passrider:profile:v1';
export const CREWCHECK_PASSRIDER_MANUAL_REPORTS_KEY = 'crewcheck:passrider:manual-reports:v1';

export type CrewCheckPassRiderStatus = {
  ok?: boolean;
  enabled?: boolean;
  proxyConfigured?: boolean;
  mode?: 'manual' | 'proxy';
  source?: string;
  message?: string;
  officialUrl?: string;
  repository?: string;
  safeMode?: boolean;
  canReceiveCredentials?: boolean;
  endpoints?: string[];
  updatedAt?: string;
};

export type CrewCheckPassRiderSearchInput = {
  origin: string;
  destination: string;
  date: string;
  flightNumber?: string;
  airline?: string;
};

export type CrewCheckPassRiderManualReport = CrewCheckPassRiderSearchInput & {
  id: string;
  createdAt: string;
  loadSummary?: string;
  standbyPosition?: string;
  notes?: string;
};

export type CrewCheckPassRiderProfile = {
  enabled: boolean;
  airline: string;
  officialUrl: string;
  searchMode: 'manual' | 'proxy';
  rememberLastSearch: boolean;
};

export const CREWCHECK_PASSRIDER_DEFAULT_PROFILE: CrewCheckPassRiderProfile = {
  enabled: false,
  airline: 'UA',
  officialUrl: 'https://employeerespss.coair.com/employeeres/PassRiderLogin.aspx',
  searchMode: 'manual',
  rememberLastSearch: true,
};

export function normalizePassRiderAirport(value?: string | null): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function normalizePassRiderDate(value?: string | null): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function loadPassRiderProfile(): CrewCheckPassRiderProfile {
  try {
    const raw = localStorage.getItem(CREWCHECK_PASSRIDER_PROFILE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...CREWCHECK_PASSRIDER_DEFAULT_PROFILE,
      ...parsed,
      enabled: Boolean(parsed?.enabled),
      searchMode: parsed?.searchMode === 'proxy' ? 'proxy' : 'manual',
      airline: String(parsed?.airline || CREWCHECK_PASSRIDER_DEFAULT_PROFILE.airline).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'UA',
      officialUrl: String(parsed?.officialUrl || CREWCHECK_PASSRIDER_DEFAULT_PROFILE.officialUrl),
      rememberLastSearch: parsed?.rememberLastSearch !== false,
    };
  } catch {
    return CREWCHECK_PASSRIDER_DEFAULT_PROFILE;
  }
}

export function savePassRiderProfile(profile: Partial<CrewCheckPassRiderProfile>): CrewCheckPassRiderProfile {
  const current = loadPassRiderProfile();
  const next: CrewCheckPassRiderProfile = {
    ...current,
    ...profile,
    searchMode: profile.searchMode === 'proxy' ? 'proxy' : profile.searchMode === 'manual' ? 'manual' : current.searchMode,
    airline: String(profile.airline || current.airline || 'UA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'UA',
    officialUrl: String(profile.officialUrl || current.officialUrl || CREWCHECK_PASSRIDER_DEFAULT_PROFILE.officialUrl),
  };
  try {
    localStorage.setItem(CREWCHECK_PASSRIDER_PROFILE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('crewcheck:passrider-profile-changed', { detail: next }));
  } catch {}
  return next;
}

export function loadPassRiderManualReports(): CrewCheckPassRiderManualReport[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CREWCHECK_PASSRIDER_MANUAL_REPORTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function savePassRiderManualReport(report: Omit<CrewCheckPassRiderManualReport, 'id' | 'createdAt'>): CrewCheckPassRiderManualReport {
  const item: CrewCheckPassRiderManualReport = {
    ...report,
    origin: normalizePassRiderAirport(report.origin),
    destination: normalizePassRiderAirport(report.destination),
    date: normalizePassRiderDate(report.date),
    flightNumber: String(report.flightNumber || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 8),
    airline: String(report.airline || 'UA').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'UA',
    id: `passrider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const reports = [item, ...loadPassRiderManualReports()].slice(0, 30);
  try { localStorage.setItem(CREWCHECK_PASSRIDER_MANUAL_REPORTS_KEY, JSON.stringify(reports)); } catch {}
  return item;
}

export function buildPassRiderManualSearch(input: CrewCheckPassRiderSearchInput) {
  const origin = normalizePassRiderAirport(input.origin);
  const destination = normalizePassRiderAirport(input.destination);
  const date = normalizePassRiderDate(input.date);
  const airline = String(input.airline || 'UA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'UA';
  const flightNumber = String(input.flightNumber || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  return { origin, destination, date, airline, flightNumber };
}

export function passRiderCanSearch(input: CrewCheckPassRiderSearchInput): boolean {
  const normalized = buildPassRiderManualSearch(input);
  return Boolean(normalized.origin && normalized.destination && normalized.date);
}

export function passRiderOfficialUrl(profile = loadPassRiderProfile()): string {
  return profile.officialUrl || CREWCHECK_PASSRIDER_DEFAULT_PROFILE.officialUrl;
}
