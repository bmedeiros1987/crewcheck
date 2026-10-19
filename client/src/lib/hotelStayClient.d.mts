export type HotelRemoteBaseline = { contractVersion: 2; id: string; bindingId: string; rowVersion: string; rosterKey: string; contextRef: string; contextSignature: string };
export function hotelRemoteBaseline(row: any): HotelRemoteBaseline | undefined;
export function hotelOnlyPatch(options: {
  baseline: HotelRemoteBaseline | null | undefined;
  latest?: any; hotelName: string; contextRef: string; contextSignature: string;
}): Record<string, unknown>;
export function createHotelStayClient(options: {
  capture: () => { owner: string; token: string | null; isCurrent: () => boolean };
  request: (path: string, options?: any) => Promise<any>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}): {
  list: () => Promise<any>;
  update: (patch: Record<string, unknown>) => Promise<any>;
};
