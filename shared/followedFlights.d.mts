export type FollowedFlight = {eventId:string;flight:string;origin:string;destination:string;scheduledDepartureUtc:string;date:string};
export function followedFlight(value:unknown):FollowedFlight|null;
export function followedFlightKey(value:unknown):string;
export function readFollowedFlights(storage:Storage,owner:string):FollowedFlight[];
export function changeFollowedFlights(storage:Storage,owner:string,value:unknown,follow:boolean):boolean;
