import { appEnv } from "@/lib/env";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const showBootstrapAdmin = appEnv.firebaseClient.projectId === "maman-contracting-dev";

  return (
    <LoginForm
      nextPath={params.next}
      showBootstrapAdmin={showBootstrapAdmin}
      bootstrapAdminEmail={showBootstrapAdmin ? appEnv.adminEmail : undefined}
    />
  );
}
