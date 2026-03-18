"use client";

import type { Job } from "@/domain/jobs/types";
import { formatDate } from "@/lib/utils";

export function buildParkingText(job: Job) {
  if (job.altParkingBlocked) {
    return "Fully blocked off by client";
  }
  if (!job.altParkingDays) {
    return "";
  }
  return `${job.altParkingDays}${job.altParkingTime ? ` · ${job.altParkingTime}` : ""}`;
}

export function buildPermitText(job: Job) {
  if (job.permits.length > 0) {
    return job.permits
      .filter((permit) => permit.number || permit.code)
      .map((permit) => {
        const parts = [permit.number || permit.code];
        if (permit.code && permit.number) {
          parts[0] = `${permit.code} · ${permit.number}`;
        }
        if (permit.expiry) {
          parts.push(`exp ${formatDate(permit.expiry)}`);
        }
        return parts.join(" · ");
      })
      .join(", ");
  }

  const fallback = job.permitNumber || job.permitCode;
  if (!fallback) {
    return "";
  }
  return `${fallback}${job.permitExpiry ? ` · exp ${formatDate(job.permitExpiry)}` : ""}`;
}

export function buildJobShareText(job: Job) {
  const lines = [
    "Maman Contracting — Job Details",
    "",
    `Address: ${job.address || "—"}`,
    `Customer: ${job.customerName || "—"}`,
    `Phone: ${job.phone || "—"}`,
    `Email: ${job.email || "—"}`,
    `Work: ${job.taskType || "—"}`,
    `Size: ${job.projectSize || "—"}`,
    `Crew: ${job.jobType || "—"}`,
    `Status: ${job.status || "—"}`,
    `Schedule day: ${formatDate(job.scheduleDay)}`,
  ];

  const parking = buildParkingText(job);
  if (parking) {
    lines.push(`Alt parking: ${parking}`);
  }

  const permit = buildPermitText(job);
  if (permit) {
    lines.push(`Permit: ${permit}`);
  }

  if (job.notes) {
    lines.push(`Notes: ${job.notes}`);
  }

  return lines.join("\n");
}

export async function shareText(title: string, text: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch {
      // fall through to WhatsApp fallback
    }
  }

  if (typeof window !== "undefined") {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }
}
