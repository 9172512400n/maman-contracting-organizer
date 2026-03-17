import type { ContactPerson } from "@/domain/common/types";

export type Contact = {
  id: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  persons: ContactPerson[];
  photoURL: string;
  bizCardURL: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactUpsertInput = {
  id?: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  primaryPersonName: string;
  primaryPersonPhone: string;
  primaryPersonRole: string;
};
