export function StatusPill({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span className="pill" data-tone={tone}>
      {label}
    </span>
  );
}
