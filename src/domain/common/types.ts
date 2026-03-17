export type AttachmentLink = {
  name: string;
  url: string;
};

export type CustomField = {
  label: string;
  value: string;
};

export type PermitChip = {
  number: string;
  code: string;
  expiry: string;
};

export type ContactPerson = {
  name: string;
  phone: string;
  role: string;
};

export type TaskNote = {
  text: string;
  addedBy?: string;
  addedByName?: string;
  addedAt?: string;
  author?: string;
  timestamp?: string;
};
