import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, X, Check, Search, Upload, Download, Info, Trash2 } from 'lucide-react'
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
  const artikel_nr = get('artikel_nr', 'artikelnr', 'article_number', 'articlenumber', 'artikelnummer')
  const name = get('name', 'bezeichnung', 'produkt')
  if (!name) return null
  // treat missing or dash-only article number as auto-generated placeholder
  const article_number = (artikel_nr && artikel_nr !== '-') ? artikel_nr : `auto-${name.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`
  const groessen = get('groessen', 'größen', 'groesse', 'größe', 'sizes')
  const preis = get('preis', 'price', 'betrag')
  const schneider = get('schneider', 'tailoring', 'wappen', 'wappenänderung')
  const geschlecht = get('geschlecht', 'gender', 'targetgender', 'hr/da')
  const genderFromCol = GENDER_MAP[geschlecht.toLowerCase()]
  const genderFromName = /\bHR\b/i.test(name) ? 'male' : /\bDA\b/i.test(name) ? 'female' : null
  // sizes: support both | and ; as separator
  const sizeSep = groessen.includes('|') ? '|' : ';'
  return {
    article_number,
    name,
    category: get('kategorie', 'category', 'kategory') || 'Sonstiges',
    gender: genderFromCol ?? genderFromName ?? 'unisex',
    sizes: groessen ? groessen.split(sizeSep).map(s => s.trim()).filter(Boolean) : [],
    price: parseFloat(preis.replace(',', '.')) || 0,
    needs_tailoring: ['ja', 'yes', '1', 'true'].includes(schneider.toLowerCase()),
    size_guide: get('grössentabelle', 'groessentabelle', 'size_guide', 'sizeguide', 'größentabelle') || null,
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
  const [orgFilter, setOrgFilter] = useState<'all' | 'Stadtpolizei' | 'Parkaufsicht'>('all')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyProduct())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importOrg, setImportOrg] = useState<'Stadtpolizei' | 'Parkaufsicht'>('Stadtpolizei')
  const [importRows, setImportRows] = useState<Omit<Product, 'id' | 'created_at'>[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState<{ ok: number; err: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ mode: 'single'; product: Product } | { mode: 'all' } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = products.filter(p =>
    (orgFilter === 'all' || p.organisation === orgFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.article_number.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase()))
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

  async function confirmAndDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    if (confirmDelete.mode === 'single') {
      await supabase.from('products').delete().eq('id', confirmDelete.product.id)
    } else {
      const ids = filtered.map(p => p.id)
      await supabase.from('products').delete().in('id', ids)
    }
    setDeleting(false)
    setConfirmDelete(null)
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
        .upsert({ ...row, organisation: importOrg }, { onConflict: 'article_number' })
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
          {isStrictAdmin && filtered.length > 0 && (
            <button onClick={() => setConfirmDelete({ mode: 'all' })} className="flex items-center gap-2 border border-red-300 text-red-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
              {orgFilter === 'all' ? 'Alle löschen' : `${orgFilter} löschen`}
            </button>
          )}
          {isStrictAdmin && (
            <button onClick={() => { setShowImport(true); setImportRows([]); setImportDone(null); setImportError(''); setImportOrg('Stadtpolizei') }} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
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

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {(['all', 'Stadtpolizei', 'Parkaufsicht'] as const).map(o => (
          <button key={o} onClick={() => setOrgFilter(o)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${orgFilter === o ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o === 'all' ? 'Alle' : o}
          </button>
        ))}
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
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Organisation</th>
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
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.organisation === 'Parkaufsicht' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {p.organisation ?? 'Stadtpolizei'}
                    </span>
                  </td>
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
                        <button onClick={() => toggleActive(p)} className={`p-1.5 rounded-md text-xs font-medium ${p.active ? 'hover:bg-orange-50 text-orange-500' : 'hover:bg-green-50 text-green-600'}`}>
                          {p.active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setConfirmDelete({ mode: 'single', product: p })} className="p-1.5 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Organisation der importierten Produkte</label>
                <div className="flex gap-2">
                  {(['Stadtpolizei', 'Parkaufsicht'] as const).map(org => (
                    <button key={org} type="button" onClick={() => setImportOrg(org)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${importOrg === org ? (org === 'Parkaufsicht' ? 'bg-orange-600 text-white border-orange-600' : 'bg-blue-700 text-white border-blue-700') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                      {org}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1">
                <p className="font-semibold text-gray-700 text-xs mb-1">Unterstützte Formate: Excel (.xlsx, .xls) und CSV (.csv)</p>
                <p className="font-mono">Spalten: artikel_nr · name · kategorie · groessen · preis · schneider · grössentabelle</p>
                <p className="text-gray-400 mt-1">Größen mit | trennen (z.B. S|M|L|XL) · Geschlecht wird aus dem Namen erkannt (HR = Herren, DA = Damen)</p>
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
                      <thead><tr className="bg-gray-50 border-b"><th className="text-left px-3 py-2">Artikel-Nr.</th><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Kategorie</th><th className="text-left px-3 py-2">Geschlecht</th><th className="text-left px-3 py-2">Preis</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono">{r.article_number}</td>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{r.category}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${r.gender === 'male' ? 'bg-blue-100 text-blue-700' : r.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
                                {r.gender === 'male' ? 'HR' : r.gender === 'female' ? 'DA' : 'Unisex'}
                              </span>
                            </td>
                            <td className="px-3 py-2">€ {r.price.toFixed(2)}</td>
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

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Produkt{confirmDelete.mode === 'all' ? 'e' : ''} löschen</h3>
                <p className="text-sm text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-6">
              {confirmDelete.mode === 'single'
                ? <>Soll <span className="font-semibold">{confirmDelete.product.name}</span> wirklich gelöscht werden?</>
                : <>Sollen wirklich <span className="font-semibold">alle {filtered.length} Produkte</span>{orgFilter !== 'all' ? ` (${orgFilter})` : ''} gelöscht werden?</>
              }
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={confirmAndDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {deleting ? 'Löschen...' : 'Löschen'}
              </button>
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
