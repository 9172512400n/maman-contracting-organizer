import { describe, expect, it } from "vitest";
import { asTaskNotes } from "@/domain/common/legacy";
import { mapLegacyContact } from "@/domain/contacts/mapper";
import { mapLegacyJob } from "@/domain/jobs/mapper";
import { mapLegacyPermit } from "@/domain/permits/mapper";
import { dedupeUsersByEmail, mapLegacyUser } from "@/domain/users/mapper";

describe("legacy adapter layer", () => {
  it("parses task notes from legacy JSON strings and drops invalid items", () => {
    const notes = asTaskNotes(
      JSON.stringify([
        {
          text: "Called customer",
          addedBy: "owner@maman.test",
          addedAt: "2026-03-17T12:00:00.000Z",
        },
        { text: "" },
        "skip-me",
      ]),
    );

    expect(notes).toEqual([
      {
        text: "Called customer",
        addedBy: "owner@maman.test",
        addedByName: "",
        addedAt: "2026-03-17T12:00:00.000Z",
        author: "",
        timestamp: "",
      },
    ]);
  });

  it("maps legacy jobs with stringified JSON fields without changing field semantics", () => {
    const job = mapLegacyJob("job-1", {
      customerName: "Acme Concrete",
      altParkingBlocked: "true",
      permits: JSON.stringify([{ number: "P-101", code: "DOT", expiry: "2026-04-01" }]),
      customFields: JSON.stringify([{ label: "Crew", value: "2" }]),
      permitDocUrls: JSON.stringify([
        { name: "Permit PDF", url: "https://files.example.test/p-101.pdf" },
      ]),
      createdAt: "2026-03-01T08:00:00.000Z",
    });

    expect(job.customerName).toBe("Acme Concrete");
    expect(job.altParkingBlocked).toBe(true);
    expect(job.permits).toEqual([{ number: "P-101", code: "DOT", expiry: "2026-04-01" }]);
    expect(job.customFields).toEqual([{ label: "Crew", value: "2" }]);
    expect(job.permitDocUrls).toEqual([
      { name: "Permit PDF", url: "https://files.example.test/p-101.pdf" },
    ]);
    expect(job.createdAt).toBe("2026-03-01T08:00:00.000Z");
  });

  it("maps contacts with legacy fallback fields and stringified persons payloads", () => {
    const contact = mapLegacyContact("contact-1", {
      name: "Legacy Contact Name",
      persons: JSON.stringify([{ name: "Ali", phone: "0300-0000000", role: "Customer" }]),
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    expect(contact.companyName).toBe("Legacy Contact Name");
    expect(contact.persons).toEqual([
      { name: "Ali", phone: "0300-0000000", role: "Customer" },
    ]);
    expect(contact.createdAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("maps permits with mixed legacy attachment shapes", () => {
    const permit = mapLegacyPermit("permit-1", {
      permitNumber: "22-19",
      docUrls: [
        "https://files.example.test/raw-link.pdf",
        { name: "Scanned Copy", url: "https://files.example.test/scanned.pdf" },
      ],
      archived: "true",
    });

    expect(permit.permitNumber).toBe("22-19");
    expect(permit.archived).toBe(true);
    expect(permit.docUrls).toEqual([
      { name: "Attachment", url: "https://files.example.test/raw-link.pdf" },
      { name: "Scanned Copy", url: "https://files.example.test/scanned.pdf" },
    ]);
  });

  it("dedupes users by preferring the active record for the same email", () => {
    const users = dedupeUsersByEmail([
      mapLegacyUser("invite-owner", {
        email: "owner@maman.test",
        status: "invited",
        invitedAt: "2026-03-01T00:00:00.000Z",
      }),
      mapLegacyUser("user-owner", {
        email: "owner@maman.test",
        status: "active",
        authUid: "uid-123",
        updatedAt: "2026-03-05T00:00:00.000Z",
      }),
    ]);

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: "user-owner",
      email: "owner@maman.test",
      status: "active",
      authUid: "uid-123",
    });
  });
});
