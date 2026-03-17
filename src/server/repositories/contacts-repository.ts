import { serverTimestamp, uploadFilesToStorage } from "@/server/repositories/helpers";
import { adminDb } from "@/server/firebase/admin";
import { mapLegacyContact } from "@/domain/contacts/mapper";
import { parseContactFormData } from "@/domain/contacts/schema";
import type { Contact, ContactUpsertInput } from "@/domain/contacts/types";
import { normalizePhone } from "@/lib/utils";

const contactsCollection = () => adminDb().collection("contacts");

function buildPeople(input: ContactUpsertInput, existing?: Contact) {
  const remaining = existing?.persons.slice(1) ?? [];
  if (!input.primaryPersonName && !input.primaryPersonPhone) {
    return existing?.persons ?? [];
  }

  return [
    {
      name: input.primaryPersonName,
      phone: input.primaryPersonPhone,
      role: input.primaryPersonRole,
    },
    ...remaining,
  ].filter((person) => person.name || person.phone);
}

export async function listContacts() {
  const snapshot = await contactsCollection().get();
  return snapshot.docs
    .map((doc) => mapLegacyContact(doc.id, doc.data()))
    .sort((left, right) => left.companyName.localeCompare(right.companyName));
}

export async function getContactById(id: string) {
  const snapshot = await contactsCollection().doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapLegacyContact(snapshot.id, snapshot.data() ?? {});
}

export async function saveContact(
  formData: FormData,
  actorEmail: string,
  uploads: { photo?: File | null; bizCard?: File | null },
) {
  const input = parseContactFormData(formData);
  const contactRef = input.id ? contactsCollection().doc(input.id) : contactsCollection().doc();
  const existing = input.id ? await getContactById(input.id) : null;

  const photoUploads = uploads.photo
    ? await uploadFilesToStorage("contacts/photos", [uploads.photo])
    : [];
  const bizUploads = uploads.bizCard
    ? await uploadFilesToStorage("contacts/business-cards", [uploads.bizCard])
    : [];
  const photoUpload = photoUploads[0];
  const bizUpload = bizUploads[0];

  const payload = {
    companyName: input.companyName,
    phone: input.phone,
    email: input.email,
    address: input.address,
    notes: input.notes,
    persons: buildPeople(input, existing ?? undefined),
    photoURL: photoUpload?.url ?? existing?.photoURL ?? "",
    bizCardURL: bizUpload?.url ?? existing?.bizCardURL ?? "",
    updatedAt: serverTimestamp(),
  };

  if (input.id) {
    await contactRef.set(
      {
        ...(existing ?? {}),
        ...payload,
      },
      { merge: true },
    );
    return contactRef.id;
  }

  await contactRef.set({
    ...payload,
    createdBy: actorEmail,
    createdAt: serverTimestamp(),
  });
  return contactRef.id;
}

export async function deleteContact(id: string) {
  await contactsCollection().doc(id).delete();
}

export async function upsertContactFromJob(job: {
  customerName: string;
  phone: string;
  email: string;
  address: string;
}, actorEmail: string) {
  if (!job.customerName && !job.phone) {
    return;
  }

  const contacts = await listContacts();
  const phoneKey = normalizePhone(job.phone);
  const existing =
    contacts.find((contact) =>
      contact.persons.some((person) => normalizePhone(person.phone) === phoneKey),
    ) ??
    contacts.find((contact) => normalizePhone(contact.phone) === phoneKey) ??
    contacts.find(
      (contact) => contact.companyName.toLowerCase() === job.customerName.trim().toLowerCase(),
    );

  if (existing) {
    const nextPeople = existing.persons.length
      ? existing.persons.map((person, index) =>
          index === 0
            ? {
                ...person,
                name: person.name || job.customerName,
                phone: job.phone || person.phone,
              }
            : person,
        )
      : job.phone
        ? [{ name: job.customerName, phone: job.phone, role: "Customer" }]
        : [];

    await contactsCollection().doc(existing.id).set(
      {
        email: job.email || existing.email,
        address: job.address || existing.address,
        persons: nextPeople,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  const docRef = contactsCollection().doc();
  await docRef.set({
    companyName: job.customerName,
    phone: job.phone,
    email: job.email,
    address: job.address,
    notes: "",
    persons: job.phone
      ? [{ name: job.customerName, phone: job.phone, role: "Customer" }]
      : [],
    createdBy: actorEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
