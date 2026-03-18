"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import type { ContactPerson } from "@/domain/common/types";
import type { Contact } from "@/domain/contacts/types";

type ContactEditorFormProps = {
  contact?: Contact | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onCancel: () => void;
};

function buildInitialPeople(contact?: Contact | null) {
  return contact?.persons?.length ? contact.persons : [{ name: "", phone: "", role: "" }];
}

function readFilePreview(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read preview file."));
    reader.readAsDataURL(file);
  });
}

export function ContactEditorForm({ contact, onSubmit, onCancel }: ContactEditorFormProps) {
  const [people, setPeople] = useState<ContactPerson[]>(() => buildInitialPeople(contact));
  const [photoPreview, setPhotoPreview] = useState(contact?.photoURL ?? "");
  const [bizCardPreview, setBizCardPreview] = useState(contact?.bizCardURL ?? "");
  const [photoLabel, setPhotoLabel] = useState("");
  const [bizCardLabel, setBizCardLabel] = useState("");

  const serializedPeople = useMemo(
    () =>
      JSON.stringify(
        people.filter((person) => person.name.trim() || person.phone.trim() || person.role.trim()),
      ),
    [people],
  );

  function updatePerson(index: number, patch: Partial<ContactPerson>) {
    setPeople((current) =>
      current.map((person, personIndex) => (personIndex === index ? { ...person, ...patch } : person)),
    );
  }

  function addPerson() {
    setPeople((current) => [...current, { name: "", phone: "", role: "" }]);
  }

  function removePerson(index: number) {
    setPeople((current) => {
      const next = current.filter((_, personIndex) => personIndex !== index);
      return next.length > 0 ? next : [{ name: "", phone: "", role: "" }];
    });
  }

  async function onPhotoPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoLabel("");
      return;
    }
    setPhotoLabel(file.name);
    setPhotoPreview(await readFilePreview(file));
  }

  async function onBizCardPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setBizCardLabel("");
      return;
    }
    setBizCardLabel(file.name);
    if (file.type.startsWith("image/")) {
      setBizCardPreview(await readFilePreview(file));
    } else {
      setBizCardPreview("");
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <input name="id" type="hidden" value={contact?.id ?? ""} />
      <input name="personsJson" type="hidden" value={serializedPeople} />
      <input name="primaryPersonName" type="hidden" value={people[0]?.name ?? ""} />
      <input name="primaryPersonPhone" type="hidden" value={people[0]?.phone ?? ""} />
      <input name="primaryPersonRole" type="hidden" value={people[0]?.role ?? ""} />

      <div className="field" data-span="2">
        <label htmlFor="companyName">Company / customer name *</label>
        <input
          id="companyName"
          name="companyName"
          required
          defaultValue={contact?.companyName ?? ""}
          placeholder="e.g. Smith Family or ABC Corp"
        />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" defaultValue={contact?.phone ?? ""} placeholder="e.g. (917) 555-1234" />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" defaultValue={contact?.email ?? ""} placeholder="e.g. contact@company.com" />
      </div>
      <div className="field" data-span="2">
        <label htmlFor="address">Address</label>
        <input id="address" name="address" defaultValue={contact?.address ?? ""} placeholder="e.g. 145 Main St, Brooklyn, NY" />
      </div>
      <div className="field" data-span="2">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" defaultValue={contact?.notes ?? ""} placeholder="Any notes about this contact..." />
      </div>

      <div className="upload-card" data-span="2">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div className="section-title">
            <label style={{ color: "var(--muted)" }}>People</label>
            <p className="muted">Optional</p>
          </div>
          <button className="button-ghost" type="button" onClick={addPerson}>
            + Add person
          </button>
        </div>
        <div className="stack">
          {people.map((person, index) => (
            <div className="inline-list-card" key={`${index}-${person.name}-${person.phone}-${person.role}`}>
              <div className="form-grid inline-list-grid">
                <div className="field">
                  <label htmlFor={`person-name-${index}`}>Name</label>
                  <input
                    id={`person-name-${index}`}
                    value={person.name}
                    onChange={(event) => updatePerson(index, { name: event.target.value })}
                    placeholder="Name"
                  />
                </div>
                <div className="field">
                  <label htmlFor={`person-phone-${index}`}>Phone</label>
                  <input
                    id={`person-phone-${index}`}
                    value={person.phone}
                    onChange={(event) => updatePerson(index, { phone: event.target.value })}
                    placeholder="Phone"
                  />
                </div>
                <div className="field">
                  <label htmlFor={`person-role-${index}`}>Role</label>
                  <input
                    id={`person-role-${index}`}
                    value={person.role}
                    onChange={(event) => updatePerson(index, { role: event.target.value })}
                    placeholder="Role (optional)"
                  />
                </div>
                <div className="field inline-list-action">
                  <button className="button-danger" type="button" onClick={() => removePerson(index)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="upload-card">
        <div className="upload-card-title">Profile Photo</div>
        <div className="contact-upload-row">
          <div className="contact-avatar-preview">
            {photoPreview ? (
              <Image alt="Profile preview" src={photoPreview} unoptimized width={64} height={64} />
            ) : (
              <span>👤</span>
            )}
          </div>
          <div className="stack" style={{ flex: 1 }}>
            <label className="button-ghost contact-upload-trigger">
              Choose photo
              <input hidden accept="image/*" id="photo" name="photo" type="file" onChange={onPhotoPicked} />
            </label>
            <p className="muted">{photoLabel || "JPG, PNG"}</p>
          </div>
        </div>
      </div>

      <div className="upload-card">
        <div className="upload-card-title">Business Card</div>
        <div className="stack">
          {bizCardPreview ? (
            <div className="contact-card-preview">
              <Image alt="Business card preview" src={bizCardPreview} unoptimized width={640} height={160} />
            </div>
          ) : contact?.bizCardURL ? (
            <a className="muted" href={contact.bizCardURL} rel="noreferrer" target="_blank">
              Existing business card
            </a>
          ) : null}
          <label className="button-ghost contact-upload-trigger">
            Scan / upload card
            <input hidden accept="image/*,.pdf" id="bizCard" name="bizCard" type="file" onChange={onBizCardPicked} />
          </label>
          <p className="muted">{bizCardLabel || "Photo or scan of their business card"}</p>
        </div>
      </div>

      <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
        <button className="button-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button" type="submit">
          {contact ? "Save contact" : "Save contact"}
        </button>
      </div>
    </form>
  );
}
