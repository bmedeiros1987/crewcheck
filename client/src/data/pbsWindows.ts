export type PbsOfficialWindow = {
  month: number;
  label: string;
  generalStart: number;
  generalEnd: number;
  instructorStart: number;
  instructorEnd: number;
  exception?: boolean;
};

export const PBS_OFFICIAL_WINDOWS: PbsOfficialWindow[] = [
  { month: 2, label: 'Fevereiro', generalStart: 7, generalEnd: 11, instructorStart: 7, instructorEnd: 10, exception: true },
  { month: 3, label: 'Março', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 15 },
  { month: 4, label: 'Abril', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 14 },
  { month: 5, label: 'Maio', generalStart: 10, generalEnd: 14, instructorStart: 10, instructorEnd: 12, exception: true },
  { month: 6, label: 'Junho', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 14 },
  { month: 7, label: 'Julho', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
  { month: 8, label: 'Agosto', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
  { month: 9, label: 'Setembro', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
  { month: 10, label: 'Outubro', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
  { month: 11, label: 'Novembro', generalStart: 10, generalEnd: 14, instructorStart: 10, instructorEnd: 12, exception: true },
  { month: 12, label: 'Dezembro', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
];

export function officialPbsWindow(month: number): PbsOfficialWindow | null {
  return PBS_OFFICIAL_WINDOWS.find((item) => item.month === Number(month)) || null;
}

export function pbsWindowDates(year: number, month: number, instructor: boolean) {
  const official = officialPbsWindow(month);
  if (!official) return null;
  const startDay = instructor ? official.instructorStart : official.generalStart;
  const endDay = instructor ? official.instructorEnd : official.generalEnd;
  return {
    official,
    opensAt: new Date(year, month - 1, startDay, 0, 0, 0, 0),
    closesAt: new Date(year, month - 1, endDay, 23, 59, 0, 0),
  };
}
