import { asContactPeople, asString, timestampToIso } from "@/domain/common/legacy";
import type { Contact } from "@/domain/contacts/types";

export function mapLegacyContact(id: string, raw: Record<string, unknown>): Contact {
  return {
    id,
    companyName: asString(raw.companyName) || asString(raw.name),
    phone: asString(raw.phone),
    email: asString(raw.email),
    address: asString(raw.address),
    notes: asString(raw.notes),
    persons: asContactPeople(raw.persons),
    photoURL: asString(raw.photoURL),
    bizCardURL: asString(raw.bizCardURL),
    createdBy: asString(raw.createdBy),
    createdAt: timestampToIso(raw.createdAt),
    updatedAt: timestampToIso(raw.updatedAt),
  };
}
