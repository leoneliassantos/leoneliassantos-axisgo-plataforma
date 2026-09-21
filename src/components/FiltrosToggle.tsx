/** Botão para mostrar/ocultar uma barra de filtros (estilo do ícone de "sliders" do Fukuda). */
export function FiltrosToggle({ aberto, onToggle }: { aberto: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={aberto ? 'Ocultar filtros' : 'Mostrar filtros'}
      aria-label={aberto ? 'Ocultar filtros' : 'Mostrar filtros'}
      className={`grid size-8 shrink-0 place-items-center rounded-md border border-line transition hover:bg-paper hover:text-ink ${
        aberto ? 'bg-paper text-ink' : 'text-muted'
      }`}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
        <path
          d="M4 6h16M7 6a2 2 0 104 0 2 2 0 00-4 0zM4 12h16M13 12a2 2 0 104 0 2 2 0 00-4 0zM4 18h16M9 18a2 2 0 104 0 2 2 0 00-4 0z"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
