import { adminDb } from "@/server/firebase/admin";
import { asCustomFields, asPermitChips, stringifyLegacyJson } from "@/domain/common/legacy";
import { mapLegacyJob } from "@/domain/jobs/mapper";
import { parseJobFormData } from "@/domain/jobs/schema";
import { appendAttachments, serverTimestamp, uploadFilesToStorage } from "@/server/repositories/helpers";
import { upsertContactFromJob } from "@/server/repositories/contacts-repository";

const jobsCollection = () => adminDb().collection("jobs");

export async function listJobs() {
  const snapshot = await jobsCollection().get();
  return snapshot.docs
    .map((doc) => mapLegacyJob(doc.id, doc.data()))
    .sort((left, right) => Date.parse(right.createdAt || "1970-01-01") - Date.parse(left.createdAt || "1970-01-01"));
}

export async function getJobById(id: string) {
  const snapshot = await jobsCollection().doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapLegacyJob(snapshot.id, snapshot.data() ?? {});
}

export async function saveJob(formData: FormData, actorEmail: string, permitFiles: File[]) {
  const input = parseJobFormData(formData);
  const docRef = input.id ? jobsCollection().doc(input.id) : jobsCollection().doc();
  const existingRaw = input.id ? (await docRef.get()).data() ?? {} : {};

  const uploadedDocs = await uploadFilesToStorage("jobs/permit-docs", permitFiles);
  const combinedDocs = appendAttachments(existingRaw.permitDocUrls ?? existingRaw.permitDocUrl, uploadedDocs);
  const permits =
    input.permitNumber || input.permitCode || input.permitExpiry
      ? [
          {
            number: input.permitNumber,
            code: input.permitCode,
            expiry: input.permitExpiry,
          },
        ]
      : asPermitChips(existingRaw.permits);

  const payload = {
    customerName: input.customerName,
    phone: input.phone,
    email: input.email,
    invoiceNumber: input.invoiceNumber,
    address: input.address,
    taskType: input.taskType,
    projectSize: input.projectSize,
    jobType: input.jobType,
    concreteSub: input.concreteSub,
    altParkingBlocked: input.altParkingBlocked,
    altParkingDays: input.altParkingBlocked ? "Fully blocked off by client" : input.altParkingDays,
    altParkingTime: input.altParkingBlocked ? "" : input.altParkingTime,
    blocked: input.blocked,
    status: input.status,
    scheduleDay: input.scheduleDay,
    completionDay: input.completionDay,
    permits: stringifyLegacyJson(permits),
    permitCode: input.permitCode,
    permitNumber: input.permitNumber,
    permitExpiry: input.permitExpiry,
    notes: input.notes,
    customFields: stringifyLegacyJson(asCustomFields(existingRaw.customFields)),
    permitDocUrls: stringifyLegacyJson(combinedDocs),
    permitDocUrl: combinedDocs[0]?.url ?? "",
    updatedBy: actorEmail,
    updatedAt: serverTimestamp(),
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
      createdAt: serverTimestamp(),
    });
  }

  await upsertContactFromJob(
    {
      customerName: input.customerName,
      phone: input.phone,
      email: input.email,
      address: input.address,
    },
    actorEmail,
  );

  return docRef.id;
}

export async function deleteJob(id: string) {
  await jobsCollection().doc(id).delete();
}

export async function setJobScheduleDay(id: string, scheduleDay: string) {
  await jobsCollection().doc(id).set(
    {
      scheduleDay,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
