import type { Timestamp } from "firebase-admin/firestore";
import type {
  AttachmentLink,
  ContactPerson,
  CustomField,
  PermitChip,
  TaskNote,
} from "@/domain/common/types";

export function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

export function asBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return false;
}

export function timestampToIso(value: unknown) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const maybeTimestamp = value as Timestamp & { toDate?: () => Date };
  if (typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate().toISOString();
  }

  return "";
}

function safeJsonParse<T>(value: string, fallback: T) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function asAttachmentLinks(value: unknown): AttachmentLink[] {
  if (Array.isArray(value)) {
    const attachments: Array<AttachmentLink | null> = value
      .map((entry) => {
        if (typeof entry === "string") {
          return { name: "Attachment", url: entry };
        }

        if (entry && typeof entry === "object") {
          const candidate = entry as Record<string, unknown>;
          return {
            name: asString(candidate.name) || "Attachment",
            url: asString(candidate.url),
          };
        }

        return null;
      });

    return attachments.filter(
      (entry): entry is AttachmentLink => entry !== null && entry.url.length > 0,
    );
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = safeJsonParse<Array<string | AttachmentLink>>(value, []);
    if (Array.isArray(parsed)) {
      return asAttachmentLinks(parsed);
    }
  }

  return [];
}

export function asPermitChips(value: unknown): PermitChip[] {
  if (Array.isArray(value)) {
    const permits: Array<PermitChip | null> = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const candidate = entry as Record<string, unknown>;
        return {
          number: asString(candidate.number),
          code: asString(candidate.code),
          expiry: asString(candidate.expiry),
        };
      });

    return permits.filter(
      (entry): entry is PermitChip =>
        entry !== null && (entry.number.length > 0 || entry.code.length > 0),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return asPermitChips(safeJsonParse(value, []));
  }

  return [];
}

export function asCustomFields(value: unknown): CustomField[] {
  if (Array.isArray(value)) {
    const customFields: Array<CustomField | null> = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const candidate = entry as Record<string, unknown>;
        return {
          label: asString(candidate.label),
          value: asString(candidate.value),
        };
      });

    return customFields.filter(
      (entry): entry is CustomField =>
        entry !== null && (entry.label.length > 0 || entry.value.length > 0),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return asCustomFields(safeJsonParse(value, []));
  }

  return [];
}

export function asContactPeople(value: unknown): ContactPerson[] {
  if (Array.isArray(value)) {
    const people: Array<ContactPerson | null> = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const candidate = entry as Record<string, unknown>;
        return {
          name: asString(candidate.name),
          phone: asString(candidate.phone),
          role: asString(candidate.role),
        };
      });

    return people.filter(
      (entry): entry is ContactPerson =>
        entry !== null && (entry.name.length > 0 || entry.phone.length > 0),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return asContactPeople(safeJsonParse(value, []));
  }

  return [];
}

export function asTaskNotes(value: unknown): TaskNote[] {
  if (Array.isArray(value)) {
    const notes: Array<TaskNote | null> = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const candidate = entry as Record<string, unknown>;
        return {
          text: asString(candidate.text),
          addedBy: asString(candidate.addedBy),
          addedByName: asString(candidate.addedByName),
          addedAt: asString(candidate.addedAt),
          author: asString(candidate.author),
          timestamp: asString(candidate.timestamp),
        };
      });

    return notes.filter(
      (entry): entry is TaskNote => entry !== null && entry.text.length > 0,
    );
  }

  if (typeof value === "string" && value.trim()) {
    return asTaskNotes(safeJsonParse(value, []));
  }

  return [];
}

export function stringifyLegacyJson(value: unknown) {
  return JSON.stringify(value ?? []);
}
