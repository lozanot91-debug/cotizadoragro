interface Props {
  className?: string;
  /** Color de la hoja (el visor). Por defecto el mismo color del trazo. */
  colorHoja?: string;
  /** Texto para lectores de pantalla; sin título el logo es decorativo. */
  titulo?: string;
}

/**
 * Logo de Cotizador Agro: una calculadora simple cuyo visor es una hoja (brote) con su nervadura.
 * Se dibuja en una grilla de 24×24 con trazo de 2 px, igual que los íconos de lucide, así que se usa con las
 * mismas clases (w-5 h-5, text-…) y toma el color del texto (currentColor).
 */
export default function LogoCotizador({ className = 'w-5 h-5', colorHoja = 'currentColor', titulo }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className} role={titulo ? 'img' : undefined} aria-hidden={titulo ? undefined : true} aria-label={titulo}>
      {titulo && <title>{titulo}</title>}
      {/* Cuerpo de la calculadora */}
      <rect x="4" y="2" width="16" height="20" rx="3" />
      {/* Visor: hoja con nervadura */}
      <path d="M7.5 10.2C8.6 6.6 12.4 5 16.6 5.2c-.4 3.6-3.6 5.9-9.1 5Z" fill={colorHoja} fillOpacity={0.6} stroke={colorHoja} strokeWidth={1.6} />
      <path d="M7.5 10.2 13 7.4" stroke={colorHoja} strokeWidth={1.3} />
      {/* Teclas */}
      <path d="M8 14.5h.01M12 14.5h.01M8 18h.01M12 18h.01" />
      <path d="M16 14.5V18" />
    </svg>
  );
}
