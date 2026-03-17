import { InviteAcceptForm } from "@/features/auth/invite-accept-form";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const email = params.email?.trim().toLowerCase() ?? "";
  const invite = params.invite?.trim() ?? "";

  if (!email || !invite) {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="callout">This invite link is missing the required parameters.</div>
        </div>
      </div>
    );
  }

  return <InviteAcceptForm email={email} invite={invite} />;
}
