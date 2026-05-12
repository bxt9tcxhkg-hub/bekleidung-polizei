import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, X, Check, Search, Upload, Download, Info } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Product } from '../lib/types'

const CSV_TEMPLATE = `artikel_nr;name;kategorie;geschlecht;groessen;preis;schneider;organisation;grössentabelle
BP-001;Diensthemd langarm;Hemd;unisex;S|M|L|XL;45.90;nein;Stadtpolizei;
BP-002;Diensthose Damen;Hose;female;34|36|38|40|42|44;89.00;ja;Stadtpolizei;https://beispiel.at/groessen`

const GENDER_MAP: Record<string, 'male' | 'female' | 'unisex'> = {
  hr: 'male', herren: 'male', male: 'male', m: 'male',
  da: 'female', damen: 'female', female: 'female', f: 'female',
  unisex: 'unisex', u: 'unisex',
}

function rowToProduct(row: Record<string, string>): Omit<Product, 'id' | 'created_at'> | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? ''
      if (val.trim()) return val.trim()
    }
    return ''
  }
  const artikel_nr = get('artikel_nr', 'artikelnr', 'article_number', 'artikelnummer')
  const name = get('name', 'bezeichnung', 'produkt')
  if (!artikel_nr || !name) return null
  const groessen = get('groessen', 'größen', 'groesse', 'größe', 'sizes')
  const preis = get('preis', 'price', 'betrag')
  const schneider = get('schneider', 'tailoring', 'wappen', 'wappenänderung')
  const geschlecht = get('geschlecht', 'gender', 'hr/da')
  const genderFromCol = GENDER_MAP[geschlecht.toLowerCase()]
  const genderFromName = /\bHR\b/.test(name) ? 'male' : /\bDA\b/.test(name) ? 'female' : null
  return {
    article_number: artikel_nr,
    name,
    category: get('kategorie', 'category', 'kategory') || 'Sonstiges',
    gender: genderFromCol ?? genderFromName ?? 'unisex',
    sizes: groessen ? groessen.split('|').map(s => s.trim()).filter(Boolean) : [],
    price: parseFloat(preis.replace(',', '.')) || 0,
    needs_tailoring: ['ja', 'yes', '1', 'true'].includes(schneider.toLowerCase()),
    size_guide: get('grössentabelle', 'groessentabelle', 'size_guide', 'größentabelle') || null,
    organisation: (() => { const o = get('organisation', 'org', 'abteilung'); return o.toLowerCase().includes('park') ? 'Parkaufsicht' : 'Stadtpolizei' })(),
    active: true,
  }
}

function parseFileToProducts(rows: Record<string, string>[]): Omit<Product, 'id' | 'created_at'>[] {
  return rows.map(rowToProduct).filter(Boolean) as Omit<Product, 'id' | 'created_at'>[]
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(s => s.trim())
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  })
}

const SIZES_COMMON = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '44', '46', '48', '50', '52', '54', '56']
const CATEGORIES = ['Hemd', 'Hose', 'Jacke', 'Pullover', 'Weste', 'Schuhe', 'Accessoire', 'Sonstiges']

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {active ? 'Aktiv' : 'Inaktiv'}
    </span>
  )
}

const GENDER_LABELS: Record<string, string> = { male: 'Herren (HR)', female: 'Damen (DA)', unisex: 'Unisex' }

const emptyProduct = (): Omit<Product, 'id' | 'created_at'> => ({
  article_number: '',
  name: '',
  category: CATEGORIES[0],
  gender: 'unisex',
  sizes: [],
  price: 0,
  needs_tailoring: false,
  size_guide: '',
  organisation: 'Stadtpolizei',
  active: true,
})

export default function Products() {
  const { isAdmin, isStrictAdmin } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyProduct())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<Omit<Product, 'id' | 'created_at'>[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState<{ ok: number; err: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.article_number.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  )

  function openNew() {
    setForm(emptyProduct())
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(p: Product) {
    setForm({ article_number: p.article_number, name: p.name, category: p.category, gender: p.gender ?? 'unisex', sizes: p.sizes, price: p.price, needs_tailoring: p.needs_tailoring, size_guide: p.size_guide ?? '', organisation: p.organisation ?? 'Stadtpolizei', active: p.active })
    setEditId(p.id)
    setError('')
    setShowForm(true)
  }

  async function save() {
    setError('')
    if (!form.article_number || !form.name) { setError('Artikelnummer und Name sind Pflichtfelder.'); return }
    setSaving(true)
    if (editId) {
      const { error } = await supabase.from('products').update(form).eq('id', editId)
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.from('products').insert(form)
      if (error) setError(error.message)
    }
    setSaving(false)
    if (!error) { setShowForm(false); load() }
  }

  async function toggleActive(p: Product) {
    await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
    load()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isExcel = file.name.match(/\.(xlsx|xls|ods)$/i)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        let rawRows: Record<string, string>[]
        if (isExcel) {
          const wb = XLSX.read(ev.target?.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          rawRows = (XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[])
            .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '')])))
        } else {
          rawRows = parseCsv(ev.target?.result as string)
        }
        const rows = parseFileToProducts(rawRows)
        if (rows.length === 0) { setImportError('Keine gültigen Zeilen gefunden. Spalten prüfen.'); return }
        setImportError('')
        setImportRows(rows)
        setImportDone(null)
      } catch {
        setImportError('Datei konnte nicht gelesen werden.')
      }
    }
    isExcel ? reader.readAsArrayBuffer(file) : reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  async function runImport() {
    setImporting(true)
    let ok = 0, err = 0
    for (const row of importRows) {
      const { error } = await supabase
        .from('products')
        .upsert(row, { onConflict: 'article_number' })
      if (error) err++; else ok++
    }
    setImporting(false)
    setImportDone({ ok, err })
    setImportRows([])
    load()
  }

  function toggleSize(size: string) {
    setForm(f => ({
      ...f,
      sizes: f.sizes.includes(size) ? f.sizes.filter(s => s !== size) : [...f.sizes, size],
    }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produkte</h1>
          <p className="text-gray-500 text-sm mt-1">Bekleidungskatalog</p>
        </div>
        <div className="flex gap-2">
          {isStrictAdmin && (
            <button onClick={() => { setShowImport(true); setImportRows([]); setImportDone(null); setImportError('') }} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              <Upload className="w-4 h-4" /> Import
            </button>
          )}
          {isAdmin && (
            <button onClick={openNew} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Neues Produkt
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suche nach Name, Artikelnummer..."
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel-Nr.</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Kategorie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Geschlecht</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Preis</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Schneider</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Keine Produkte gefunden</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.article_number}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{p.category}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.gender === 'male' ? 'bg-blue-100 text-blue-700' : p.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
                      {GENDER_LABELS[p.gender ?? 'unisex']}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                    <span>€ {Number(p.price).toFixed(2)}</span>
                    {p.size_guide && (
                      <a href={p.size_guide} target="_blank" rel="noopener noreferrer" title="Größentabelle" className="ml-1.5 inline-flex text-blue-500 hover:text-blue-700">
                        <Info className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {p.needs_tailoring ? <Check className="w-4 h-4 text-green-600" /> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-4 py-3"><Badge active={p.active} /></td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toggleActive(p)} className={`p-1.5 rounded-md text-xs font-medium ${p.active ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600'}`}>
                          {p.active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Produkte importieren</h2>
              <button onClick={() => setShowImport(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1">
                <p className="font-semibold text-gray-700 text-xs mb-1">Unterstützte Formate: Excel (.xlsx, .xls) und CSV (.csv)</p>
                <p className="font-mono">Spalten: artikel_nr · name · kategorie · geschlecht · groessen · preis · schneider · organisation · grössentabelle</p>
                <p className="text-gray-400 mt-1">Größen mit | trennen (z.B. S|M|L|XL) · Geschlecht: hr / da / unisex</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Upload className="w-4 h-4" /> Datei wählen
                </button>
                <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`} download="produkte-vorlage.csv" className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Download className="w-4 h-4" /> Vorlage herunterladen
                </a>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.ods" className="hidden" onChange={handleFile} />
              </div>
              {importError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{importError}</p>}
              {importDone && (
                <p className={`text-sm px-3 py-2 rounded-lg ${importDone.err === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {importDone.ok} Produkte importiert{importDone.err > 0 ? `, ${importDone.err} Fehler` : ''}.
                </p>
              )}
              {importRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{importRows.length} Produkte erkannt – Vorschau:</p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 border-b"><th className="text-left px-3 py-2">Artikel-Nr.</th><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Kategorie</th><th className="text-left px-3 py-2">Preis</th><th className="text-left px-3 py-2">Größen</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono">{r.article_number}</td>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{r.category}</td>
                            <td className="px-3 py-2">€ {r.price.toFixed(2)}</td>
                            <td className="px-3 py-2">{r.sizes.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowImport(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Schließen</button>
              {importRows.length > 0 && (
                <button onClick={runImport} disabled={importing} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                  {importing ? 'Importiere...' : `${importRows.length} Produkte importieren`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit/New Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editId ? 'Produkt bearbeiten' : 'Neues Produkt'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Artikelnummer *</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.article_number} onChange={e => setForm(f => ({ ...f, article_number: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kategorie</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Geschlecht</label>
                <div className="flex gap-2">
                  {(['unisex', 'male', 'female'] as const).map(g => (
                    <button key={g} type="button" onClick={() => setForm(f => ({ ...f, gender: g }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.gender === g ? (g === 'male' ? 'bg-blue-700 text-white border-blue-700' : g === 'female' ? 'bg-pink-600 text-white border-pink-600' : 'bg-gray-700 text-white border-gray-700') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                      {GENDER_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Preis (€)</label>
                  <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Organisation</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.organisation ?? ''} onChange={e => setForm(f => ({ ...f, organisation: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Größen</label>
                <div className="flex flex-wrap gap-2">
                  {SIZES_COMMON.map(s => (
                    <button key={s} type="button" onClick={() => toggleSize(s)} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${form.sizes.includes(s) ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Größentabelle (URL, optional)</label>
                <input type="url" placeholder="https://..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.size_guide ?? ''} onChange={e => setForm(f => ({ ...f, size_guide: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="tailoring" checked={form.needs_tailoring} onChange={e => setForm(f => ({ ...f, needs_tailoring: e.target.checked }))} className="rounded" />
                <label htmlFor="tailoring" className="text-sm text-gray-700">Benötigt Schneiderei</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                <label htmlFor="active" className="text-sm text-gray-700">Aktiv</label>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
