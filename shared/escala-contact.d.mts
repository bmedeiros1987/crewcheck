export type EscalaContact = { schema: 'crewcheck.escala-contact.v1'; dialString: string; revision: number; updatedAt: string | null };
export const ESCALA_CONTACT_SCHEMA: 'crewcheck.escala-contact.v1';
export const DEFAULT_ESCALA_DIAL_STRING: string;
export const ESCALA_CONTACT_READ_PATH: string;
export const ESCALA_CONTACT_ADMIN_PATH: string;
export function validEscalaDialString(value: unknown): value is string;
export function escalaTelUri(value: unknown): string | null;
export function validEscalaContact(value: unknown): value is EscalaContact;
export function defaultEscalaContact(): EscalaContact;
