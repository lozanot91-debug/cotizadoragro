/**
 * Corta una espera que se cuelga: si `promesa` no termina en `ms`, falla con un mensaje claro.
 * (No cancela la consulta de fondo; solo evita que la pantalla se quede esperando para siempre.)
 */
export function conTimeout<T>(promesa: PromiseLike<T>, ms: number, mensaje = 'El servidor tardó demasiado en responder. Probá de nuevo.'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, rechazar) => {
    timer = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  return Promise.race([Promise.resolve(promesa), limite]).finally(() => clearTimeout(timer));
}

/** Señal de cancelación que se dispara a los `ms`, combinada con una señal opcional del llamador. */
export function senalConTimeout(ms: number, senal?: AbortSignal): AbortSignal {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const cortar = () => { clearTimeout(t); ctl.abort(); };
  if (senal) {
    if (senal.aborted) cortar();
    else senal.addEventListener('abort', cortar, { once: true });
  }
  return ctl.signal;
}
