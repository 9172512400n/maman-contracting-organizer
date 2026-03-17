"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { deleteContact, listContacts, saveContact } from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import type { Contact } from "@/domain/contacts/types";

export default function ContactsPage() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") ?? "";
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadContacts() {
    setLoading(true);
    setError(null);
    try {
      setContacts(await listContacts());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load contacts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.isActive) {
      return;
    }

    void loadContacts();
  }, [session?.isActive]);

  const currentContact = contacts.find((item) => item.id === editId) ?? null;
  const primaryPerson = currentContact?.persons[0];

  async function onSaveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      const id = await saveContact(new FormData(event.currentTarget), session);
      await loadContacts();
      router.replace(`/contacts?edit=${id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save contact.");
    }
  }

  async function onDeleteContact(id: string) {
    setError(null);
    try {
      await deleteContact(id);
      await loadContacts();
      if (editId === id) {
        router.replace("/contacts");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete contact.");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Contacts</p>
          <h1>Contact management</h1>
          <p className="muted">Preserving the same contact fields and person array structure.</p>
        </div>
        {currentContact ? (
          <Link className="button-ghost" href="/contacts">
            Clear edit
          </Link>
        ) : null}
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title={currentContact ? "Edit contact" : "Create contact"}>
        <form key={currentContact?.id ?? "new"} className="form-grid" onSubmit={onSaveContact}>
          <input name="id" type="hidden" value={currentContact?.id ?? ""} />
          <div className="field">
            <label htmlFor="companyName">Company / customer</label>
            <input id="companyName" name="companyName" defaultValue={currentContact?.companyName} />
          </div>
          <div className="field">
            <label htmlFor="phone">Main phone</label>
            <input id="phone" name="phone" defaultValue={currentContact?.phone} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" defaultValue={currentContact?.email} />
          </div>
          <div className="field">
            <label htmlFor="address">Address</label>
            <input id="address" name="address" defaultValue={currentContact?.address} />
          </div>
          <div className="field">
            <label htmlFor="primaryPersonName">Primary person</label>
            <input id="primaryPersonName" name="primaryPersonName" defaultValue={primaryPerson?.name} />
          </div>
          <div className="field">
            <label htmlFor="primaryPersonPhone">Primary person phone</label>
            <input id="primaryPersonPhone" name="primaryPersonPhone" defaultValue={primaryPerson?.phone} />
          </div>
          <div className="field">
            <label htmlFor="primaryPersonRole">Primary person role</label>
            <input id="primaryPersonRole" name="primaryPersonRole" defaultValue={primaryPerson?.role} />
          </div>
          <div className="field">
            <label htmlFor="photo">Profile photo</label>
            <input id="photo" name="photo" type="file" accept="image/*" />
          </div>
          <div className="field">
            <label htmlFor="bizCard">Business card</label>
            <input id="bizCard" name="bizCard" type="file" accept="image/*,.pdf" />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" defaultValue={currentContact?.notes} />
          </div>
          <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
            <button className="button" type="submit">
              {currentContact ? "Save changes" : "Create contact"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Contacts">
        {loading ? (
          <p className="muted">Loading contacts...</p>
        ) : contacts.length === 0 ? (
          <EmptyState title="No contacts yet" description="Job saves can auto-upsert contacts, or add one here." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>People</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.companyName}</td>
                    <td>{contact.email || "—"}</td>
                    <td>{contact.phone || "—"}</td>
                    <td>{contact.persons.length}</td>
                    <td>
                      <div className="actions-row">
                        <Link className="button-ghost" href={`/contacts?edit=${contact.id}`}>
                          Edit
                        </Link>
                        <button
                          className="button-danger"
                          type="button"
                          onClick={() => {
                            void onDeleteContact(contact.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
