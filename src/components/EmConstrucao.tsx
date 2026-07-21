export function EmConstrucao({
  titulo,
  descricao,
  itens,
}: {
  titulo: string
  descricao: string
  itens?: string[]
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
      <div className="max-w-md">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand mx-auto">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor">
            <path
              d="M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-ink">{titulo}</h2>
        <p className="mt-2 text-muted">{descricao}</p>
        {itens && itens.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {itens.map((i) => (
              <span key={i} className="rounded-md bg-paper px-2.5 py-1 text-[12px] text-ink/70">
                {i}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
