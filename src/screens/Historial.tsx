import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { HistorialCambio } from '@/types';
import { History, Search, FileSpreadsheet, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatearFechaHora } from '@/lib/fechas';

const PAGE_SIZE = 50;

const formatFechaHora = formatearFechaHora;

const tipoLabels: Record<string, string> = {
  estado: 'Estado',
  cotizacion: 'Cotización',
  linea: 'Línea',
  margen: 'Margen',
  costo: 'Costo',
  lista: 'Lista',
  config: 'Configuración',
};

export default function Historial() {
  const [registros, setRegistros] = useState<HistorialCambio[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCotizNum, setFiltroCotizNum] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('historial_cambios').select('*', { count: 'exact' });

    if (filtroFechaDesde) {
      query = query.gte('created_at', `${filtroFechaDesde}T00:00:00-03:00`);
    }
    if (filtroFechaHasta) {
      query = query.lte('created_at', `${filtroFechaHasta}T23:59:59.999-03:00`);
    }
    if (filtroUsuario) {
      query = query.ilike('usuario_nombre', `%${filtroUsuario}%`);
    }
    if (filtroTipo) {
      query = query.eq('tipo', filtroTipo);
    }

    if (filtroCotizNum) {
      const { data: cotiz } = await supabase
        .from('cotizaciones')
        .select('id')
        .eq('numero', parseInt(filtroCotizNum) || 0)
        .maybeSingle();
      if (cotiz) {
        query = query.eq('cotizacion_id', cotiz.id);
      } else {
        query = query.eq('cotizacion_id', 'impossible');
      }
    }

    query = query.order('created_at', { ascending: false });
    const from = page * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count } = await query;
    setRegistros((data || []) as HistorialCambio[]);
    setTotal(count || 0);
    setLoading(false);
  }, [page, filtroFechaDesde, filtroFechaHasta, filtroUsuario, filtroTipo, filtroCotizNum]);

  useEffect(() => { load(); }, [load]);

  function aplicarFiltros() {
    setPage(0);
    load();
  }

  function limpiarFiltros() {
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
    setFiltroUsuario('');
    setFiltroTipo('');
    setFiltroCotizNum('');
    setPage(0);
  }

  function exportarExcel() {
    const rows = registros.map((r) => ({
      'Fecha y hora': formatFechaHora(r.created_at),
      'Usuario': r.usuario_nombre,
      'Tipo': tipoLabels[r.tipo] || r.tipo,
      'Entidad': r.entidad || '',
      'Campo': r.campo || '',
      'Anterior': r.valor_anterior || '',
      'Nuevo': r.valor_nuevo || '',
      'Detalle': r.detalle || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    XLSX.writeFile(wb, 'Historial_cambios.xlsx');
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <History className="w-7 h-7 text-gray-400" /> Historial de cambios
        </h1>
        <button
          onClick={exportarExcel}
          disabled={registros.length === 0}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
        >
          <FileSpreadsheet className="w-4 h-4" /> Exportar a Excel
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Usuario</label>
            <input type="text" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}
              placeholder="Nombre..." className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none bg-white">
              <option value="">Todos</option>
              {Object.entries(tipoLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">N° Cotización</label>
            <input type="text" value={filtroCotizNum} onChange={(e) => setFiltroCotizNum(e.target.value)}
              placeholder="Ej. 15" className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={aplicarFiltros} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1">
            <Search className="w-4 h-4" /> Filtrar
          </button>
          <button onClick={limpiarFiltros} className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">
            Limpiar
          </button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : registros.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
          Todavía no hay cambios registrados
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Fecha y hora</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Usuario</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Entidad</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Campo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Anterior</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Nuevo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{formatFechaHora(r.created_at)}</td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{r.usuario_nombre}</td>
                      <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tipoLabels[r.tipo] || r.tipo}</span></td>
                      <td className="px-3 py-2 text-gray-600">{r.entidad || '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{r.campo || '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{r.valor_anterior || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{r.valor_nuevo || '-'}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{r.detalle || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {total} registros · Página {page + 1} de {totalPages || 1}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
