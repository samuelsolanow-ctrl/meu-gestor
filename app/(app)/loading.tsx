// Aparece na hora em que você toca numa aba, enquanto os dados chegam.
export default function Loading() {
  const block = (h: number) => (
    <div className="card skeleton" style={{ height: h }} aria-hidden="true" />
  );
  return (
    <main className="page" aria-busy="true" aria-label="Carregando">
      <div className="skeleton" style={{ height: 36, width: 160, borderRadius: 10 }} aria-hidden="true" />
      <div className="skeleton" style={{ height: 50, borderRadius: 14 }} aria-hidden="true" />
      {block(210)}
      {block(120)}
      {block(180)}
    </main>
  );
}
