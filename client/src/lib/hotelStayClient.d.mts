export function createHotelStayClient(options: {
  capture: () => { owner: string; token: string | null; isCurrent: () => boolean };
  request: (path: string, options?: any) => Promise<any>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}): {
  list: () => Promise<any>;
  update: (patch: Record<string, unknown>) => Promise<any>;
};
