import { useState, type ReactNode } from 'react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { ModalCambioEstado, ModalSeguimiento, type DatosConfirmacion } from '@/components/ModalCambioEstado';
import { registrarCambio } from '@/lib/historial';
import { esReapertura, estaCerrada } from '@/lib/estados';
import { hoyAR, sumarDias } from '@/lib/fechas';
import { generarCobranzas } from '@/lib/cobranzas';
import { parseNumberInput } from '@/lib/format';
import type { Cotizacion, CotizacionLinea, EstadoCotizacion } from '@/types';

interface Pedido {
  cotiz: Cotizacion;
  hacia: EstadoCotizacion;
  lineas: CotizacionLinea[];
}

interface Seguimiento {
  cotiz: Cotizacion;
  dias: number;
  crear: boolean;
}

/**
 * Único flujo de cambio de estado de la app (Cotizaciones, Pipeline, etc.).
 * - Siempre pide confirmación.
 * - Perdida exige motivo; reabrir (Ganada/Perdida → En negociación) exige comentario.
 * - Al pasar a Enviada ofrece agendar el seguimiento.
 * - Las reglas se validan también en la capa de datos (cambiarEstadoCotizacion).
 *
 * Uso: const { solicitarCambioEstado, modales } = useCambioEstado({ onCambiado: load });
 *      ... y renderizar {modales} una vez en la pantalla.
 */
export function useCambioEstado({ onCambiado }: { onCambiado: () => void }): {
  solicitarCambioEstado: (cotiz: Cotizacion, hacia: EstadoCotizacion) => Promise<boolean>;
  modales: ReactNode;
} {
  const data = useData();
  const { usuario } = useAuth();
  const toast = useToast();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null);
  const [guardando, setGuardando] = useState(false);

  /** Abre el modal de confirmación. Devuelve false si el cambio no se puede ni pedir. */
  async function solicitarCambioEstado(cotiz: Cotizacion, hacia: EstadoCotizacion): Promise<boolean> {
    if (cotiz.estado === hacia) return false;
    if (estaCerrada(cotiz.estado) && hacia !== 'En negociación') {
      toast.aviso('Para reabrir una cotización pasala a En negociación.');
      return false;
    }
    try {
      const lineas = hacia === 'Ganada' ? await data.fetchLineas(cotiz.id) : [];
      setPedido({ cotiz, hacia, lineas });
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    }
  }

  async function confirmar(datos: DatosConfirmacion) {
    if (!pedido || guardando) return;
    const { cotiz, hacia } = pedido;
    setGuardando(true);
    try {
      let cantidadesReales: Record<string, { cantidad: number; precio: number }> | undefined;
      if (hacia === 'Ganada') {
        cantidadesReales = {};
        for (const [lineaId, v] of Object.entries(datos.cantidadesReales)) {
          cantidadesReales[lineaId] = { cantidad: parseNumberInput(v.cantidad), precio: parseNumberInput(v.precio) };
        }
      }

      const { anterior, motivoAnterior } = await data.cambiarEstadoCotizacion(cotiz.id, hacia, {
        motivo: datos.motivo,
        comentario: datos.comentario,
        cantidadesReales,
      });

      let detalle: string | undefined;
      if (hacia === 'Perdida') detalle = `Motivo: ${datos.motivo}`;
      else if (esReapertura(anterior, hacia)) {
        detalle = `Reabierta: ${datos.comentario}`;
        if (anterior === 'Perdida' && motivoAnterior) detalle += ` · Motivo de pérdida anterior: ${motivoAnterior}`;
      } else if (hacia === 'Ganada') detalle = 'Cantidades y precios reales registrados';

      await registrarCambio({
        tipo: 'estado',
        cotizacion_id: cotiz.id,
        campo: 'estado',
        valor_anterior: anterior,
        valor_nuevo: hacia,
        detalle,
      });

      setPedido(null);
      toast.exito(`Cotización N° ${cotiz.numero}: ${hacia}`);

      // Cobranzas: al ganar se cargan los cobros por plazo; al reabrir se borran los que faltan cobrar
      try {
        if (hacia === 'Ganada' && (await data.contarCobranzas(cotiz.id)) === 0) {
          const cobros = generarCobranzas(cotiz, pedido.lineas, hoyAR());
          await data.crearCobranzas(cobros.map((c) => ({ cotizacion_id: cotiz.id, ...c })));
          if (cobros.length > 0) toast.exito(cobros.length === 1 ? 'Se cargó 1 cobro en Cobranzas.' : `Se cargaron ${cobros.length} cobros en Cobranzas.`);
        } else if (anterior === 'Ganada') {
          await data.borrarCobranzasPendientes(cotiz.id);
        }
      } catch (e) {
        toast.aviso(`La cotización quedó en ${hacia}, pero no se pudieron actualizar los cobros: ${e instanceof Error ? e.message : 'error desconocido'}`);
      }

      if (hacia === 'Enviada') {
        let dias = 3;
        try { dias = (await data.fetchConfig()).seguimiento_dias || 3; } catch { /* usa 3 */ }
        setSeguimiento({ cotiz, dias, crear: true });
      }
      onCambiado();
    } catch (e) {
      // El modal queda abierto con lo que el usuario cargó
      toast.error(e);
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarSeguimiento() {
    if (!seguimiento || guardando) return;
    const { cotiz, dias, crear } = seguimiento;
    if (!crear) { setSeguimiento(null); return; }
    setGuardando(true);
    try {
      const nombre = usuario?.nombre || 'Admin';
      await data.createTarea({
        titulo: `Seguimiento cotización N° ${cotiz.numero}`,
        tipo: 'Seguimiento',
        fecha_vencimiento: sumarDias(hoyAR(), dias),
        asignado_a: nombre,
        creada_por: nombre,
        cotizacion_id: cotiz.id,
        cliente_id: cotiz.cliente_id,
      });
      await registrarCambio({ tipo: 'tarea', cotizacion_id: cotiz.id, campo: 'seguimiento', valor_nuevo: `+${dias} días` });
      setSeguimiento(null);
      toast.exito('Seguimiento agendado');
      onCambiado();
    } catch (e) {
      toast.error(e);
    } finally {
      setGuardando(false);
    }
  }

  const modales = (
    <>
      {pedido && (
        <ModalCambioEstado
          key={`${pedido.cotiz.id}-${pedido.hacia}`}
          cotiz={pedido.cotiz}
          hacia={pedido.hacia}
          lineas={pedido.lineas}
          guardando={guardando}
          onCancelar={() => setPedido(null)}
          onConfirmar={confirmar}
        />
      )}
      {seguimiento && (
        <ModalSeguimiento
          numero={seguimiento.cotiz.numero}
          dias={seguimiento.dias}
          crear={seguimiento.crear}
          guardando={guardando}
          onCambiar={(v) => setSeguimiento({ ...seguimiento, ...v })}
          onCancelar={() => setSeguimiento(null)}
          onConfirmar={confirmarSeguimiento}
        />
      )}
    </>
  );

  return { solicitarCambioEstado, modales };
}
