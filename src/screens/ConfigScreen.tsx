import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';
import { parsearMargenesExcel } from '@/lib/excel';
import type { FamiliaConfig, MargenProducto, Configuracion, ConvenioFlete } from '@/types';
import { Save, Upload, Loader2, Check, AlertCircle, Plus, Trash2 } from 'lucide-react';
import UsuariosAdmin from '@/components/UsuariosAdmin';
import { registrarCambio, registrarCambios, fmtMargen, type CambioHistorial } from '@/lib/historial';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import LiquidacionCanje from '@/components/LiquidacionCanje';
import { normalizarParams, PARAMS_CANJE_BASE } from '@/lib/canje';
import { normalizarFormasPago, type TarjetaPago } from '@/lib/formasPago';

const canjeEjemplo = 300;

export default function ConfigScreen() {
  const data = useData();
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [familias, setFamilias] = useState<FamiliaConfig[]>([]);
  const [margenesProd, setMargenesProd] = useState<MargenProducto[]>([]);
  const [convenios, setConvenios] = useState<ConvenioFlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'empresa' | 'familias' | 'margenes' | 'crm' | 'canje' | 'formasPago'>('empresa');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const [cfg, fams, margs] = await Promise.all([
      data.fetchConfig(),
      data.fetchFamiliasConfig(),
      data.fetchMargenesProducto(),
    ]);
    setConfig(cfg);
    data.fetchConvenios().then(setConvenios).catch(() => setConvenios([]));
    setFamilias(fams);
    setMargenesProd(margs as MargenProducto[]);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

  useEffect(() => { load(); }, [load]);

  async function guardarConfig() {
    if (!config) return;
    setSaving(true);
    const prev = await data.fetchConfig();
    const updates = [
      { clave: 'empresa_nombre', valor: config.empresa_nombre },
      { clave: 'empresa_cuit', valor: config.empresa_cuit },
      { clave: 'empresa_telefono', valor: config.empresa_telefono },
      { clave: 'empresa_direccion', valor: config.empresa_direccion },
      { clave: 'margen_general', valor: String(config.margen_general) },
      { clave: 'tipo_cambio_default', valor: String(config.tipo_cambio_default) },
      { clave: 'iva_fertilizantes', valor: String(config.iva_fertilizantes) },
      { clave: 'iva_agroquimicos', valor: String(config.iva_agroquimicos) },
      { clave: 'vigencia_default', valor: String(config.vigencia_default) },
      { clave: 'prob_borrador', valor: String(config.prob_borrador) },
      { clave: 'prob_enviada', valor: String(config.prob_enviada) },
      { clave: 'prob_negociacion', valor: String(config.prob_negociacion) },
      { clave: 'sin_respuesta_dias', valor: String(config.sin_respuesta_dias) },
      { clave: 'seguimiento_dias', valor: String(config.seguimiento_dias) },
      { clave: 'ultimo_contacto_dias', valor: String(config.ultimo_contacto_dias) },
      { clave: 'canje_parametros', valor: JSON.stringify(normalizarParams(config.canje_parametros)) },
      { clave: 'formas_pago_parametros', valor: JSON.stringify(normalizarFormasPago(config.formas_pago_parametros)) },
    ];
    const cambios: CambioHistorial[] = [];
    for (const u of updates) {
      await data.updateConfig(u.clave, u.valor);
      if (u.clave === 'margen_general' && prev.margen_general !== config.margen_general) {
        cambios.push({ tipo: 'margen', campo: 'margen general', entidad: 'General', valor_anterior: fmtMargen(prev.margen_general), valor_nuevo: fmtMargen(config.margen_general) });
      }
      if (u.clave === 'tipo_cambio_default' && prev.tipo_cambio_default !== config.tipo_cambio_default) {
        cambios.push({ tipo: 'config', campo: 'tipo de cambio default', valor_anterior: String(prev.tipo_cambio_default), valor_nuevo: String(config.tipo_cambio_default) });
      }
      if (u.clave === 'iva_fertilizantes' && prev.iva_fertilizantes !== config.iva_fertilizantes) {
        cambios.push({ tipo: 'config', campo: 'IVA fertilizantes', valor_anterior: `${prev.iva_fertilizantes}%`, valor_nuevo: `${config.iva_fertilizantes}%` });
      }
      if (u.clave === 'iva_agroquimicos' && prev.iva_agroquimicos !== config.iva_agroquimicos) {
        cambios.push({ tipo: 'config', campo: 'IVA agroquímicos', valor_anterior: `${prev.iva_agroquimicos}%`, valor_nuevo: `${config.iva_agroquimicos}%` });
      }
      if (u.clave === 'canje_parametros' && JSON.stringify(prev.canje_parametros) !== u.valor) {
        cambios.push({ tipo: 'config', campo: 'parámetros de canje', valor_anterior: JSON.stringify(prev.canje_parametros), valor_nuevo: u.valor });
      }
      if (u.clave === 'formas_pago_parametros' && JSON.stringify(prev.formas_pago_parametros) !== u.valor) {
        cambios.push({ tipo: 'config', campo: 'parámetros de formas de pago', valor_anterior: JSON.stringify(prev.formas_pago_parametros), valor_nuevo: u.valor });
      }
      if (u.clave === 'vigencia_default' && prev.vigencia_default !== config.vigencia_default) {
        cambios.push({ tipo: 'config', campo: 'vigencia default', valor_anterior: `${prev.vigencia_default} días`, valor_nuevo: `${config.vigencia_default} días` });
      }
    }
    if (cambios.length > 0) await registrarCambios(cambios);
    setMsg({ type: 'success', text: 'Configuración guardada' });
    setSaving(false);
    setTimeout(() => setMsg(null), 2000);
  }

  async function updateFamilia(fam: FamiliaConfig, updates: { moneda?: 'USD' | 'ARS'; margen_default?: number | null }) {
    const patch: { moneda?: 'USD' | 'ARS'; margen_default?: number | null } = {};
    if (updates.moneda !== undefined) patch.moneda = updates.moneda;
    if (updates.margen_default !== undefined) patch.margen_default = updates.margen_default;
    if (updates.margen_default !== undefined && updates.margen_default !== fam.margen_default) {
      await registrarCambio({ tipo: 'margen', entidad: `Familia ${fam.familia}`, campo: 'margen', valor_anterior: fmtMargen(fam.margen_default), valor_nuevo: fmtMargen(updates.margen_default) });
    }
    if (updates.moneda !== undefined && updates.moneda !== fam.moneda) {
      await registrarCambio({ tipo: 'margen', entidad: `Familia ${fam.familia}`, campo: 'moneda', valor_anterior: fam.moneda, valor_nuevo: updates.moneda });
    }
    await data.upsertFamiliaConfig(fam.familia, patch);
    load();
  }

  async function updateMargenProducto(productoId: string, margen: number) {
    const existing = margenesProd.find((m) => m.producto_id === productoId);
    if (existing && existing.margen !== margen) {
      const prodInfo = existing as MargenProducto & { producto?: { cod: string; producto: string } };
      await registrarCambio({ tipo: 'margen', entidad: `Producto ${prodInfo.producto?.cod || productoId}`, campo: 'margen', valor_anterior: fmtMargen(existing.margen), valor_nuevo: fmtMargen(margen) });
    }
    await data.upsertMargenProducto(productoId, margen);
    load();
  }

  async function handleImportMargenes(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const margenes = await parsearMargenesExcel(buffer);
      let actualizadas = 0;
      let creadas = 0;
      let noEncontrados = 0;
      const cambios: CambioHistorial[] = [];

      const famsExistentes = await data.fetchFamiliasConfig();
      const famMap = new Map(famsExistentes.map((f) => [f.familia, f]));
      const margenesProdExistentes = await data.fetchMargenesProducto();
      const margProdMap = new Map(margenesProdExistentes.map((m) => [m.producto_id, m.margen]));

      for (const m of margenes) {
        if (m.cod) {
          const { data: prod } = await supabase.from('productos').select('id, producto').eq('cod', m.cod).maybeSingle();
          if (prod) {
            const prev = margProdMap.get(prod.id);
            if (prev !== m.margen) {
              cambios.push({ tipo: 'margen', entidad: `Producto ${m.cod}`, campo: 'margen', valor_anterior: prev !== undefined ? fmtMargen(prev) : null, valor_nuevo: fmtMargen(m.margen) });
            }
            await data.upsertMargenProducto(prod.id, m.margen);
            actualizadas++;
          } else {
            noEncontrados++;
          }
        } else if (m.familia) {
          const famExist = famMap.get(m.familia);
          if (famExist) {
            if (famExist.margen_default !== m.margen) {
              cambios.push({ tipo: 'margen', entidad: `Familia ${m.familia}`, campo: 'margen', valor_anterior: fmtMargen(famExist.margen_default), valor_nuevo: fmtMargen(m.margen) });
            }
            await data.updateFamiliaMargen(m.familia, m.margen);
            actualizadas++;
          } else {
            const moneda = m.familia.toUpperCase().startsWith('AB ') ? 'ARS' : 'USD';
            await data.upsertFamiliaConfig(m.familia, { moneda, margen_default: m.margen });
            cambios.push({ tipo: 'margen', entidad: `Familia ${m.familia}`, campo: 'margen', valor_anterior: null, valor_nuevo: fmtMargen(m.margen), detalle: 'Familia creada' });
            creadas++;
          }
        }
      }
      if (cambios.length > 0) {
        cambios.push({ tipo: 'margen', campo: 'importación Excel', valor_nuevo: `${actualizadas} actualizados, ${creadas} creados, ${noEncontrados} no encontrados`, detalle: 'Importación masiva de márgenes' });
        await registrarCambios(cambios);
      }
      const parts = [`Actualizadas: ${actualizadas}`];
      if (creadas > 0) parts.push(`Creadas: ${creadas}`);
      if (noEncontrados > 0) parts.push(`Códigos no encontrados: ${noEncontrados}`);
      setMsg({ type: 'success', text: parts.join(' · ') });
      load();
      setTimeout(() => setMsg(null), 4000);
    } catch {
      setMsg({ type: 'error', text: 'Error al importar márgenes' });
    }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Márgenes y configuración</h1>

      <UsuariosAdmin />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button onClick={() => setTab('empresa')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'empresa' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Empresa</button>
        <button onClick={() => setTab('familias')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'familias' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Familias</button>
        <button onClick={() => setTab('margenes')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'margenes' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Márgenes por producto</button>
        <button onClick={() => setTab('crm')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'crm' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>CRM</button>
        <button onClick={() => setTab('canje')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'canje' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Canje</button>
        <button onClick={() => setTab('formasPago')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'formasPago' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Formas de pago</button>
      </div>

      {/* Tab: Empresa */}
      {tab === 'empresa' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la empresa</label>
              <input type="text" value={config.empresa_nombre} onChange={(e) => setConfig({ ...config, empresa_nombre: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
              <input type="text" value={config.empresa_cuit} onChange={(e) => setConfig({ ...config, empresa_cuit: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="text" value={config.empresa_telefono} onChange={(e) => setConfig({ ...config, empresa_telefono: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input type="text" value={config.empresa_direccion} onChange={(e) => setConfig({ ...config, empresa_direccion: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Margen general por defecto (%)</label>
              <input type="number" step="0.1" value={config.margen_general} onChange={(e) => setConfig({ ...config, margen_general: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cambio de respaldo</label>
              <input type="number" value={config.tipo_cambio_default} onChange={(e) => setConfig({ ...config, tipo_cambio_default: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-gray-400 mt-1">Las cotizaciones nuevas usan el dólar divisa BNA vendedor. Este valor se usa solo si el BNA no responde.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IVA fertilizantes (%)</label>
              <input type="number" step="0.1" value={config.iva_fertilizantes} onChange={(e) => setConfig({ ...config, iva_fertilizantes: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IVA agroquímicos (%)</label>
              <input type="number" step="0.1" value={config.iva_agroquimicos} onChange={(e) => setConfig({ ...config, iva_agroquimicos: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vigencia default (días)</label>
              <input type="number" value={config.vigencia_default} onChange={(e) => setConfig({ ...config, vigencia_default: parseInt(e.target.value) || 15 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <button onClick={guardarConfig} disabled={saving} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        </div>
      )}

      {/* Tab: Familias */}
      {tab === 'familias' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-3">Margen vacío = usar el margen general</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Familia</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Moneda</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Margen default %</th>
                </tr>
              </thead>
              <tbody>
                {familias.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-700">{f.familia}</td>
                    <td className="py-2 px-2">
                      <select
                        value={f.moneda}
                        onChange={(e) => updateFamilia(f, { moneda: e.target.value as 'USD' | 'ARS' })}
                        className="px-2 py-1 border border-gray-300 rounded text-sm outline-none bg-white"
                      >
                        <option value="USD">USD</option>
                        <option value="ARS">ARS</option>
                      </select>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        step="0.1"
                        value={f.margen_default ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                          updateFamilia(f, { margen_default: val });
                        }}
                        placeholder="General"
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Márgenes por producto */}
      {tab === 'margenes' && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportMargenes(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Importar márgenes desde Excel
            </button>
            <p className="text-xs text-gray-400 mt-2">Columnas: Cod. o Familia, Margen %. La moneda de las familias existentes no se modifica.</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Código</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Producto</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Familia</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600">Margen %</th>
                  </tr>
                </thead>
                <tbody>
                  {margenesProd.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="py-2 px-2 text-gray-500">{(m as MargenProducto & { producto?: { cod: string; producto: string; familia: string } }).producto?.cod}</td>
                      <td className="py-2 px-2 text-gray-700">{(m as MargenProducto & { producto?: { cod: string; producto: string; familia: string } }).producto?.producto}</td>
                      <td className="py-2 px-2 text-gray-500">{(m as MargenProducto & { producto?: { cod: string; producto: string; familia: string } }).producto?.familia}</td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="0.1"
                          value={m.margen}
                          onChange={(e) => updateMargenProducto(m.producto_id, parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                  {margenesProd.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400">No hay márgenes por producto cargados</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: CRM */}
      {tab === 'crm' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-700">Probabilidades de cierre por etapa</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Borrador (%)</label>
              <input type="number" value={config.prob_borrador} onChange={(e) => setConfig({ ...config, prob_borrador: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enviada (%)</label>
              <input type="number" value={config.prob_enviada} onChange={(e) => setConfig({ ...config, prob_enviada: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">En negociación (%)</label>
              <input type="number" value={config.prob_negociacion} onChange={(e) => setConfig({ ...config, prob_negociacion: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <hr className="border-gray-100" />
          <h3 className="font-semibold text-gray-700">Parámetros del CRM</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Días sin respuesta</label>
              <input type="number" value={config.sin_respuesta_dias} onChange={(e) => setConfig({ ...config, sin_respuesta_dias: parseFloat(e.target.value) || 7 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-gray-400 mt-1">Cotización Enviada/En negociación sin tareas se marca "sin respuesta" después de N días</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Días seguimiento post-envío</label>
              <input type="number" value={config.seguimiento_dias} onChange={(e) => setConfig({ ...config, seguimiento_dias: parseFloat(e.target.value) || 3 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-gray-400 mt-1">Tarea de seguimiento automática al enviar cotización</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alerta último contacto (días)</label>
              <input type="number" value={config.ultimo_contacto_dias} onChange={(e) => setConfig({ ...config, ultimo_contacto_dias: parseFloat(e.target.value) || 60 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-gray-400 mt-1">Chip rojo en la ficha del cliente si pasaron más de N días</p>
            </div>
          </div>
          <button onClick={guardarConfig} disabled={saving} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        </div>
      )}

      {/* Tab: Canje */}
      {tab === 'canje' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4 max-w-2xl">
          <div>
            <h3 className="font-semibold text-gray-700">Liquidación del grano por defecto</h3>
            <p className="text-xs text-gray-500 mt-1">Con estos valores arrancan la calculadora de canje, la cotización y el pedido de facturación. En cada cálculo se pueden cambiar. El desglose de abajo es un ejemplo con soja a USD {canjeEjemplo}/tn.</p>
          </div>
          <LiquidacionCanje precio={canjeEjemplo} params={config.canje_parametros} onChange={(p) => setConfig({ ...config, canje_parametros: p })} defaults={PARAMS_CANJE_BASE}
            flete={{ convenios, tcCompra: config.tipo_cambio_default || null }} />
          <p className="text-xs text-gray-400">El flete del ejemplo usa el TC de respaldo; en cada cálculo se usa el comprador del BNA.</p>
          <button onClick={guardarConfig} disabled={saving} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        </div>
      )}

      {/* Tab: Formas de pago */}
      {tab === 'formasPago' && (() => {
        const fp = config.formas_pago_parametros;
        const setFp = (c: Partial<typeof fp>) => setConfig({ ...config, formas_pago_parametros: { ...fp, ...c } });
        const setTarjeta = (id: string, c: Partial<TarjetaPago>) => setFp({ tarjetas: fp.tarjetas.map((t) => (t.id === id ? { ...t, ...c } : t)) });
        return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4 max-w-3xl">
          <div>
            <h3 className="font-semibold text-gray-700">Formas de pago</h3>
            <p className="text-xs text-gray-500 mt-1">Se usan como valores por defecto en el comparador de formas de pago.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tasa de referencia anual USD (%)</label>
              <input type="number" step="0.1" value={fp.tasa_ref_anual_pct} onChange={(e) => setFp({ tasa_ref_anual_pct: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Devaluación estimada mensual (%)</label>
              <input type="number" step="0.1" value={fp.devaluacion_mensual_pct} onChange={(e) => setFp({ devaluacion_mensual_pct: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descuento contado (%)</label>
              <input type="number" step="0.1" value={fp.descuento_contado_pct} onChange={(e) => setFp({ descuento_contado_pct: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Tarjetas</h4>
            {fp.tarjetas.map((t) => (
              <div key={t.id} className="flex flex-wrap items-end gap-2">
                <label className="block w-44">
                  <span className="block text-[11px] text-gray-500 mb-0.5">Nombre</span>
                  <input value={t.nombre} onChange={(e) => setTarjeta(t.id, { nombre: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </label>
                <label className="block w-20">
                  <span className="block text-[11px] text-gray-500 mb-0.5">Moneda</span>
                  <select value={t.moneda} onChange={(e) => setTarjeta(t.id, { moneda: e.target.value === 'ARS' ? 'ARS' : 'USD' })} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none bg-white">
                    <option value="USD">USD</option><option value="ARS">$</option>
                  </select>
                </label>
                <label className="block w-24">
                  <span className="block text-[11px] text-gray-500 mb-0.5">ND empresa %</span>
                  <input type="number" step="any" value={t.nd_pct} onChange={(e) => setTarjeta(t.id, { nd_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </label>
                <label className="block w-24">
                  <span className="block text-[11px] text-gray-500 mb-0.5">TNA %</span>
                  <input type="number" step="any" value={t.tna_pct} onChange={(e) => setTarjeta(t.id, { tna_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </label>
                <label className="block w-24">
                  <span className="block text-[11px] text-gray-500 mb-0.5">Días</span>
                  <input type="number" step="0.1" value={t.dias} onChange={(e) => setTarjeta(t.id, { dias: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </label>
                <button onClick={() => setFp({ tarjetas: fp.tarjetas.filter((x) => x.id !== t.id) })} aria-label="Quitar tarjeta" className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => setFp({ tarjetas: [...fp.tarjetas, { id: `t-${Date.now()}`, nombre: 'Tarjeta nueva', moneda: 'USD', nd_pct: 0, tna_pct: 0, dias: 180 }] })} className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800">
              <Plus className="w-4 h-4" /> Agregar tarjeta
            </button>
          </div>
          <button onClick={guardarConfig} disabled={saving} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        </div>
        );
      })()}

      {/* Mensaje */}
      {msg && (
        <div className={`fixed bottom-4 right-4 px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${msg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {msg.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
