"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import type { Contact } from "@/domain/contacts/types";
import { deleteContact, listContacts, saveContact } from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";

export default function ContactsPage() {
  const { session } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

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

  const currentContact = contacts.find((item) => item.id === editingContactId) ?? null;
  const primaryPerson = currentContact?.persons[0];
  const filteredContacts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return contacts.filter((contact) =>
      !needle ||
      [contact.companyName, contact.email, contact.phone, contact.address, contact.persons.map((person) => person.name).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [contacts, search]);

  async function onSaveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      await saveContact(new FormData(event.currentTarget), session);
      setDialogOpen(false);
      setEditingContactId(null);
      await loadContacts();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save contact.");
    }
  }

  async function onDeleteContact(id: string) {
    setError(null);
    try {
      await deleteContact(id);
      await loadContacts();
      if (editingContactId === id) {
        setEditingContactId(null);
        setDialogOpen(false);
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
          <h1>Contacts</h1>
          <p className="muted">Browse the list first, then add or edit a contact from a dialog.</p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => {
            setEditingContactId(null);
            setDialogOpen(true);
          }}
        >
          + Add contact
        </button>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title="Contacts">
        <div className="stack">
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by company, person, phone, or email..."
          />

          {loading ? (
            <p className="muted">Loading contacts...</p>
          ) : filteredContacts.length === 0 ? (
            <EmptyState title="No contacts found" description="Create the first contact or refine the search." />
          ) : (
            <div className="stack">
              {filteredContacts.map((contact) => (
                <div className="record-card" key={contact.id}>
                  <div className="record-header">
                    <div className="stack">
                      <strong>{contact.companyName || "Untitled contact"}</strong>
                      <div className="inline-meta">
                        {contact.email ? <span className="muted">{contact.email}</span> : null}
                        {contact.phone ? <span className="muted">{contact.phone}</span> : null}
                        {contact.persons[0]?.name ? <span className="muted">{contact.persons[0].name}</span> : null}
                      </div>
                    </div>
                    <div className="actions-row">
                      <button
                        className="button-ghost"
                        type="button"
                        onClick={() => {
                          setEditingContactId(contact.id);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button className="button-danger" type="button" onClick={() => void onDeleteContact(contact.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="record-meta-grid">
                    <span className="muted">Address: {contact.address || "—"}</span>
                    <span className="muted">People: {contact.persons.length}</span>
                    <span className="muted">Photo: {contact.photoURL ? "Yes" : "No"}</span>
                    <span className="muted">Business card: {contact.bizCardURL ? "Yes" : "No"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <Dialog
        open={dialogOpen}
        title={currentContact ? "Edit contact" : "Add contact"}
        description="Preserves the same contact fields and person array structure."
        onClose={() => {
          setDialogOpen(false);
          setEditingContactId(null);
        }}
      >
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
          <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              className="button-ghost"
              type="button"
              onClick={() => {
                setDialogOpen(false);
                setEditingContactId(null);
              }}
            >
              Cancel
            </button>
            <button className="button" type="submit">
              {currentContact ? "Save changes" : "Create contact"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
