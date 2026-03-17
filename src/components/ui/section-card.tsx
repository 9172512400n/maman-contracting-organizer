export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section-card">
      <div className="section-head">
        <div className="section-title">
          <h2>{title}</h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
