import { adminDb } from "@/server/firebase/admin";
import { mapLegacyPermit } from "@/domain/permits/mapper";
import { parsePermitFormData } from "@/domain/permits/schema";
import { appendAttachments, buildIsoNow, uploadFilesToStorage } from "@/server/repositories/helpers";

const permitsCollection = () => adminDb().collection("permits");

export async function listPermits() {
  const snapshot = await permitsCollection().get();
  return snapshot.docs
    .map((doc) => mapLegacyPermit(doc.id, doc.data()))
    .sort((left, right) => Date.parse(right.createdAt || "1970-01-01") - Date.parse(left.createdAt || "1970-01-01"));
}

export async function getPermitById(id: string) {
  const snapshot = await permitsCollection().doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapLegacyPermit(snapshot.id, snapshot.data() ?? {});
}

export async function savePermit(formData: FormData, actorEmail: string, docFiles: File[]) {
  const input = parsePermitFormData(formData);
  const docRef = input.id ? permitsCollection().doc(input.id) : permitsCollection().doc();
  const existingRaw = input.id ? (await docRef.get()).data() ?? {} : {};
  const uploadedDocs = await uploadFilesToStorage("permits/documents", docFiles);
  const combinedDocs = appendAttachments(existingRaw.docUrls ?? existingRaw.docUrl, uploadedDocs);

  const payload = {
    permitNumber: input.permitNumber,
    permitTypeCode: input.permitTypeCode,
    validFrom: input.validFrom,
    expirationDate: input.expirationDate,
    permitHolder: input.permitHolder,
    jobAddress: input.jobAddress,
    status: input.status,
    notes: input.notes,
    linkedJobId: input.linkedJobId,
    docUrl: combinedDocs[0]?.url ?? "",
    docUrls: combinedDocs,
    updatedBy: actorEmail,
    updatedAt: buildIsoNow(),
  };

  if (input.id) {
    await docRef.set(
      {
        ...existingRaw,
        ...payload,
      },
      { merge: true },
    );
  } else {
    await docRef.set({
      ...existingRaw,
      ...payload,
      createdBy: actorEmail,
      createdAt: buildIsoNow(),
      archived: false,
      dotNotified: false,
      dotNotifiedDate: "",
    });
  }

  return docRef.id;
}

export async function setPermitArchived(id: string, archived: boolean) {
  await permitsCollection().doc(id).set({ archived }, { merge: true });
}

export async function setPermitDotNotified(id: string, dotNotified: boolean) {
  await permitsCollection().doc(id).set(
    {
      dotNotified,
      dotNotifiedDate: dotNotified ? buildIsoNow() : "",
    },
    { merge: true },
  );
}

export async function deletePermit(id: string) {
  await permitsCollection().doc(id).delete();
}
