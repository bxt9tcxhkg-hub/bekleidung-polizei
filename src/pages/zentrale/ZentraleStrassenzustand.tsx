import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileArchive, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import { MELDUNGSART_LABEL, ZUSTAND_LABEL, aktiveSperren, formatZeitraum, fromTimestamp, strassenName, toTimestamp } from '../../lib/strassenzustand'
import { generateStrassenzustandPdf } from '../../lib/strassenzustandPdf'
import { Actions, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import type {
  StrassenzustandBericht,
  StrassenzustandBerichtzeile,
  StrassenzustandMeldungsart,
  StrassenzustandStammdatum,
  StrassenzustandZustand,
} from '../../lib/types'

const ZUSTAND_OPTIONS = Object.keys(ZUSTAND_LABEL) as StrassenzustandZustand[]
const SONSTIGE = '__sonstige__'

type RowDraft = {
  strasseId: string
  strasseFreitext: string
  zustand: StrassenzustandZustand
  zustandFreitext: string
  auftraggeberId: string
  auftraggeberFreitext: string
  melderId: string
  melderFreitext: string
  gueltigVonDatum: string
  gueltigVonZeit: string
  gueltigBisDatum: string
  gueltigBisZeit: string
  // Nur bei bestehenden, zu bearbeitenden Zeilen gesetzt - damit ihre
  // chronologische Position (und damit die automatische Meldungsart-Historie
  // anderer Berichte) beim Speichern erhalten bleibt, statt "jetzt" zu werden.
  createdAt?: string
}

function todayIso() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function emptyRow(): RowDraft {
  return { strasseId: '', strasseFreitext: '', zustand: 'frei_befahrbar', zustandFreitext: '', auftraggeberId: '', auftraggeberFreitext: '', melderId: '', melderFreitext: '', gueltigVonDatum: todayIso(), gueltigVonZeit: '', gueltigBisDatum: '', gueltigBisZeit: '' }
}
function rowFromZeile(zeile: StrassenzustandBerichtzeile): RowDraft {
  const von = fromTimestamp(zeile.gueltig_von)
  const bis = fromTimestamp(zeile.gueltig_bis)
  return {
    strasseId: zeile.strasse_id ?? '',
    strasseFreitext: zeile.strasse_freitext ?? '',
    zustand: zeile.zustand,
    zustandFreitext: zeile.zustand_freitext ?? '',
    auftraggeberId: zeile.auftraggeber_id ?? '',
    auftraggeberFreitext: zeile.auftraggeber_freitext ?? '',
    melderId: zeile.melder_id ?? '',
    melderFreitext: zeile.melder_freitext ?? '',
    gueltigVonDatum: von.datum,
    gueltigVonZeit: von.zeit,
    gueltigBisDatum: bis.datum,
    gueltigBisZeit: bis.zeit,
    createdAt: zeile.created_at,
  }
}

const MELDUNGSART_BADGE: Record<StrassenzustandMeldungsart, string> = {
  neuzugang: 'bg-red-100 text-red-800',
  aenderung: 'bg-amber-100 text-amber-800',
  widerruf: 'bg-green-100 text-green-800',
}

export default function ZentraleStrassenzustand({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [strassen, setStrassen] = useState<StrassenzustandStammdatum[]>([])
  const [auftraggeber, setAuftraggeber] = useState<StrassenzustandStammdatum[]>([])
  const [melder, setMelder] = useState<StrassenzustandStammdatum[]>([])
  const [berichte, setBerichte] = useState<StrassenzustandBericht[]>([])
  const [zeilen, setZeilen] = useState<StrassenzustandBerichtzeile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingBericht, setEditingBericht] = useState<StrassenzustandBericht | null>(null)
  const [rows, setRows] = useState<RowDraft[]>([emptyRow()])
  const [anmerkung, setAnmerkung] = useState('')

  const [showStammdaten, setShowStammdaten] = useState<'strassen' | 'auftraggeber' | 'melder' | null>(null)
  const [neuerName, setNeuerName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [strassenRes, auftraggeberRes, melderRes, berichteRes, zeilenRes] = await Promise.all([
      supabase.from('strassenzustand_strassen').select('*').order('sort_order').order('name'),
      supabase.from('strassenzustand_auftraggeber').select('*').order('sort_order').order('name'),
      supabase.from('strassenzustand_melder').select('*').order('sort_order').order('name'),
      supabase.from('strassenzustand_berichte').select('*, profiles!strassenzustand_berichte_bearbeiter_fkey(name,dienstnummer)').order('created_at', { ascending: false }),
      supabase.from('strassenzustand_berichtzeilen').select('*, strassenzustand_strassen(name), strassenzustand_auftraggeber(name), strassenzustand_melder(name)').order('created_at', { ascending: false }),
    ])
    if (strassenRes.error || berichteRes.error || zeilenRes.error) setError('Die Straßenzustandsdaten konnten nicht vollständig geladen werden.')
    else setError('')
    setStrassen((strassenRes.data ?? []) as StrassenzustandStammdatum[])
    setAuftraggeber((auftraggeberRes.data ?? []) as StrassenzustandStammdatum[])
    setMelder((melderRes.data ?? []) as StrassenzustandStammdatum[])
    setBerichte((berichteRes.data ?? []) as unknown as StrassenzustandBericht[])
    setZeilen((zeilenRes.data ?? []) as unknown as StrassenzustandBerichtzeile[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const aktive = useMemo(() => aktiveSperren(zeilen), [zeilen])
  const zeilenByBericht = useMemo(() => {
    const map = new Map<string, StrassenzustandBerichtzeile[]>()
    for (const zeile of zeilen) {
      const list = map.get(zeile.bericht_id) ?? []
      list.push(zeile)
      map.set(zeile.bericht_id, list)
    }
    return map
  }, [zeilen])
  const activeStrassen = useMemo(() => strassen.filter(s => s.active), [strassen])
  const activeAuftraggeber = useMemo(() => auftraggeber.filter(a => a.active), [auftraggeber])
  const activeMelder = useMemo(() => melder.filter(m => m.active), [melder])

  function openNewForm() { setEditingBericht(null); setRows([emptyRow()]); setAnmerkung(''); setShowForm(true); setError('') }
  function openEditForm(bericht: StrassenzustandBericht) {
    const berichtZeilen = zeilenByBericht.get(bericht.id) ?? []
    setEditingBericht(bericht)
    setRows(berichtZeilen.length > 0 ? berichtZeilen.map(rowFromZeile) : [emptyRow()])
    setAnmerkung(bericht.anmerkung ?? '')
    setShowForm(true)
    setError('')
  }
  function patchRow(index: number, patch: Partial<RowDraft>) {
    setRows(current => current.map((row, i) => i === index ? { ...row, ...patch } : row))
  }
  function addRow() { setRows(current => [...current, emptyRow()]) }
  function removeRow(index: number) { setRows(current => current.length > 1 ? current.filter((_, i) => i !== index) : current) }
  function closeForm() { setShowForm(false); setEditingBericht(null) }

  function rowToPayload(row: RowDraft, berichtId: string) {
    return {
      bericht_id: berichtId,
      strasse_id: row.strasseId || null,
      strasse_freitext: row.strasseId ? null : row.strasseFreitext.trim(),
      zustand: row.zustand,
      zustand_freitext: row.zustandFreitext.trim() || null,
      auftraggeber_id: row.auftraggeberId || null,
      auftraggeber_freitext: row.auftraggeberId ? null : (row.auftraggeberFreitext.trim() || null),
      melder_id: row.melderId || null,
      melder_freitext: row.melderId ? null : (row.melderFreitext.trim() || null),
      gueltig_von: toTimestamp(row.gueltigVonDatum || todayIso(), row.gueltigVonZeit) as string,
      gueltig_bis: toTimestamp(row.gueltigBisDatum, row.gueltigBisZeit),
      // Bestehende Zeilen behalten ihren ursprünglichen Zeitstempel, damit die
      // automatische Meldungsart-Ableitung (vergleicht mit der zeitlich
      // letzten Zeile derselben Straße) beim Bearbeiten nicht durcheinander
      // gerät - eine bearbeitete alte Meldung soll nicht plötzlich als "jetzt"
      // gelten. Neue Zeilen (beim Bearbeiten hinzugefügt) bekommen wie beim
      // Neuanlegen den aktuellen Zeitpunkt vom Datenbank-Default.
      ...(row.createdAt ? { created_at: row.createdAt } : {}),
    }
  }

  async function saveBericht() {
    if (!profile?.id) return
    for (const row of rows) {
      if (!row.strasseId && !row.strasseFreitext.trim()) { setError('Bitte für jede Zeile eine Straße auswählen oder eingeben.'); return }
      if (row.zustand !== 'frei_befahrbar' && !row.zustandFreitext.trim()) { setError('Bitte bei "Gesperrt" oder "Sonstige" den Grund beschreiben.'); return }
      if (row.gueltigBisZeit && !row.gueltigBisDatum) { setError('Bitte für die Uhrzeit bei "Gültig bis" auch ein Datum angeben.'); return }
    }
    setSaving(true)

    let berichtId: string
    if (editingBericht) {
      const { error: updateError } = await supabase.from('strassenzustand_berichte').update({ anmerkung: anmerkung.trim() || null }).eq('id', editingBericht.id)
      if (updateError) { setSaving(false); setError('Bericht konnte nicht aktualisiert werden.'); return }
      // Bestehende Zeilen ersetzen statt einzeln zu aktualisieren - so greift
      // beim Neueinfügen exakt derselbe Trigger zur automatischen
      // Meldungsart-Ableitung wie beim Neuanlegen (der nur bei INSERT feuert).
      const { error: deleteError } = await supabase.from('strassenzustand_berichtzeilen').delete().eq('bericht_id', editingBericht.id)
      if (deleteError) { setSaving(false); setError('Bestehende Straßen konnten nicht ersetzt werden.'); return }
      berichtId = editingBericht.id
    } else {
      const { data: bericht, error: berichtError } = await supabase.from('strassenzustand_berichte')
        .insert({ bearbeiter: profile.id, anmerkung: anmerkung.trim() || null })
        .select('id').single()
      if (berichtError || !bericht) { setSaving(false); setError('Bericht konnte nicht angelegt werden.'); return }
      berichtId = bericht.id
    }

    const payload = rows.map(row => rowToPayload(row, berichtId))
    const { error: zeilenError } = await supabase.from('strassenzustand_berichtzeilen').insert(payload)
    setSaving(false)
    if (zeilenError) { setError('Straßen konnten nicht gespeichert werden.'); return }
    logAudit(editingBericht ? 'Straßenzustandsbericht bearbeitet' : 'Straßenzustandsbericht angelegt', editingBericht ? `Bericht Nr. ${editingBericht.nummer} · ${rows.length} Straße(n)` : `${rows.length} Straße(n)`)
    setShowForm(false)
    setEditingBericht(null)
    setNotice(editingBericht ? 'Bericht wurde aktualisiert. Bitte ggf. erneut als PDF exportieren.' : 'Bericht wurde gespeichert. Bitte als PDF exportieren und archivieren.')
    await load()
  }

  async function deleteBericht(bericht: StrassenzustandBericht) {
    const warning = bericht.pdf_file_key
      ? `Bericht Nr. ${bericht.nummer} ist bereits archiviert. Trotzdem endgültig löschen? Das archivierte PDF bleibt gespeichert, ist danach aber keinem Bericht mehr zugeordnet.`
      : `Straßenzustandsbericht Nr. ${bericht.nummer} endgültig löschen?`
    if (!window.confirm(warning)) return
    const { error: deleteError } = await supabase.from('strassenzustand_berichte').delete().eq('id', bericht.id)
    if (deleteError) { setError('Der Bericht konnte nicht gelöscht werden.'); return }
    logAudit('Straßenzustandsbericht endgültig gelöscht', `Bericht Nr. ${bericht.nummer}`)
    setNotice('Bericht wurde endgültig gelöscht.')
    await load()
  }

  function exportPdf(bericht: StrassenzustandBericht) {
    const berichtZeilen = zeilenByBericht.get(bericht.id) ?? []
    generateStrassenzustandPdf({
      nummer: bericht.nummer,
      bearbeiterName: bericht.profiles?.name || 'Unbekannt',
      anmerkung: bericht.anmerkung,
      zeilen: berichtZeilen,
    })
  }

  async function archivePdf(bericht: StrassenzustandBericht, file: File) {
    if (!profile?.id) return
    if (file.type !== 'application/pdf') { setError('Bitte eine PDF-Datei hochladen.'); return }
    setSaving(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const response = await fetch('/strassenzustand-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
          'Content-Type': 'application/pdf',
          'X-File-Size': String(file.size),
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || 'Upload fehlgeschlagen.')
      }
      const uploaded = await response.json() as { key: string; name: string }
      const { error: updateError } = await supabase.from('strassenzustand_berichte').update({
        pdf_file_key: uploaded.key, pdf_file_name: uploaded.name, pdf_uploaded_at: new Date().toISOString(), pdf_uploaded_by: profile.id,
      }).eq('id', bericht.id)
      if (updateError) throw new Error('Archivierung konnte nicht gespeichert werden.')
      logAudit('Straßenzustandsbericht archiviert', `Bericht Nr. ${bericht.nummer}`)
      setNotice('Bericht wurde archiviert.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archivierung fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  async function openArchivedPdf(bericht: StrassenzustandBericht) {
    if (!bericht.pdf_file_key) return
    const { data: sessionData } = await supabase.auth.getSession()
    try {
      const response = await fetch(`/files/${bericht.pdf_file_key}`, { headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` } })
      if (!response.ok) throw new Error()
      const blobUrl = URL.createObjectURL(await response.blob())
      window.open(blobUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      setError('Archiviertes PDF konnte nicht geöffnet werden.')
    }
  }

  async function addStammdatum(kind: 'strassen' | 'auftraggeber' | 'melder') {
    if (!neuerName.trim()) return
    const table = `strassenzustand_${kind}` as const
    const { error: insertError } = await supabase.from(table).insert({ name: neuerName.trim() })
    if (insertError) { setError('Eintrag konnte nicht angelegt werden (evtl. bereits vorhanden).'); return }
    setNeuerName('')
    await load()
  }
  async function toggleStammdatum(kind: 'strassen' | 'auftraggeber' | 'melder', item: StrassenzustandStammdatum) {
    const table = `strassenzustand_${kind}` as const
    await supabase.from(table).update({ active: !item.active }).eq('id', item.id)
    await load()
  }

  return <div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <div className="space-y-6">

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">Aktive Sperren / Meldungen</h2>
          {canManage ? <button type="button" onClick={openNewForm} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Bericht erfassen</button> : null}
        </div>
        {aktive.length === 0 ? <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-800"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Alle Straßen frei befahrbar.</div>
        : <div className="space-y-2">{aktive.map(zeile => <div key={zeile.id} className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-red-900">{strassenName(zeile)}</p><span className="text-xs font-semibold bg-white px-2 py-0.5 rounded-full text-red-800">{ZUSTAND_LABEL[zeile.zustand]}</span></div><p className="text-sm text-red-800 mt-1">{formatZeitraum(zeile)}</p>{zeile.zustand_freitext ? <p className="text-sm text-red-800">{zeile.zustand_freitext}</p> : null}</div>)}</div>}
      </section>

      <section>
        <h2 className="font-bold text-gray-900 mb-3">Berichte-Archiv</h2>
        {berichte.length === 0 ? <p className="text-sm text-gray-500">Noch keine Berichte erfasst.</p>
        : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{berichte.map(bericht => {
          const berichtZeilen = zeilenByBericht.get(bericht.id) ?? []
          return <article key={bericht.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-semibold text-gray-900">Bericht Nr. {bericht.nummer}</p><p className="text-xs text-gray-500">{new Date(bericht.created_at).toLocaleString('de-AT')} · {bericht.profiles?.name ?? 'Unbekannt'}</p></div>
              {bericht.pdf_file_key ? <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1"><FileArchive className="w-3.5 h-3.5" /> Archiviert</span> : <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">Noch nicht archiviert</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">{berichtZeilen.map(zeile => <span key={zeile.id} className={`text-xs font-medium px-2 py-0.5 rounded-full ${MELDUNGSART_BADGE[zeile.meldungsart]}`}>{strassenName(zeile)} · {MELDUNGSART_LABEL[zeile.meldungsart]}</span>)}</div>
            {bericht.anmerkung ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{bericht.anmerkung}</p> : null}
            {canManage ? <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" onClick={() => exportPdf(bericht)} className="text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">Als PDF exportieren</button>
              {bericht.pdf_file_key
                ? <button type="button" onClick={() => void openArchivedPdf(bericht)} className="text-xs font-semibold text-green-700 border border-green-200 px-3 py-1.5 rounded-lg">Archiviertes PDF öffnen</button>
                : <label className="text-xs font-semibold text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> PDF archivieren
                    <input type="file" accept="application/pdf" className="hidden" disabled={saving} onChange={event => { const file = event.target.files?.[0]; if (file) void archivePdf(bericht, file); event.target.value = '' }} />
                  </label>}
              <button type="button" onClick={() => openEditForm(bericht)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg"><Pencil className="w-3.5 h-3.5" /> Bearbeiten</button>
              <button type="button" onClick={() => void deleteBericht(bericht)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 border border-red-200 px-3 py-1.5 rounded-lg"><Trash2 className="w-3.5 h-3.5" /> Löschen</button>
            </div> : null}
          </article>
        })}</div>}
      </section>

      {canManage ? <section>
        <h2 className="font-bold text-gray-900 mb-3">Stammdaten verwalten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StammdatenCard title="Straßen" items={strassen} onManage={() => { setShowStammdaten('strassen'); setNeuerName('') }} />
          <StammdatenCard title="Auftraggeber" items={auftraggeber} onManage={() => { setShowStammdaten('auftraggeber'); setNeuerName('') }} />
          <StammdatenCard title="Meldende" items={melder} onManage={() => { setShowStammdaten('melder'); setNeuerName('') }} />
        </div>
      </section> : null}
    </div>}

    {showForm ? <Modal title={editingBericht ? `Bericht Nr. ${editingBericht.nummer} bearbeiten` : 'Straßenzustandsbericht erfassen'} close={closeForm}>
      <div className="space-y-4">
        {rows.map((row, index) => <div key={index} className="rounded-xl border border-gray-200 p-3 space-y-3">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Straße {index + 1}</p>{rows.length > 1 ? <button type="button" onClick={() => removeRow(index)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Zeile entfernen"><Trash2 className="w-4 h-4" /></button> : null}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-600">Straße<select className={inputClass} value={row.strasseId || SONSTIGE} onChange={event => patchRow(index, { strasseId: event.target.value === SONSTIGE ? '' : event.target.value })}>{activeStrassen.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value={SONSTIGE}>Sonstige …</option></select></label>
            {!row.strasseId ? <Field label="Sonstige Straße *" value={row.strasseFreitext} onChange={value => patchRow(index, { strasseFreitext: value })} /> : <div />}
            <label className="text-xs font-medium text-gray-600">Zustand<select className={inputClass} value={row.zustand} onChange={event => patchRow(index, { zustand: event.target.value as StrassenzustandZustand })}>{ZUSTAND_OPTIONS.map(z => <option key={z} value={z}>{ZUSTAND_LABEL[z]}</option>)}</select></label>
            <Field label={row.zustand === 'frei_befahrbar' ? 'Grund/Detail (optional)' : 'Grund/Detail *'} value={row.zustandFreitext} onChange={value => patchRow(index, { zustandFreitext: value })} />
            <label className="text-xs font-medium text-gray-600">Auftrag von<select className={inputClass} value={row.auftraggeberId || SONSTIGE} onChange={event => patchRow(index, { auftraggeberId: event.target.value === SONSTIGE ? '' : event.target.value })}>{activeAuftraggeber.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}<option value={SONSTIGE}>Sonstige …</option></select></label>
            {!row.auftraggeberId ? <Field label="Sonstige/r Auftraggeber/in" value={row.auftraggeberFreitext} onChange={value => patchRow(index, { auftraggeberFreitext: value })} /> : <div />}
            <label className="text-xs font-medium text-gray-600">Meldung durch<select className={inputClass} value={row.melderId || SONSTIGE} onChange={event => patchRow(index, { melderId: event.target.value === SONSTIGE ? '' : event.target.value })}>{activeMelder.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}<option value={SONSTIGE}>Sonstige …</option></select></label>
            {!row.melderId ? <Field label="Sonstige/r Melder/in" value={row.melderFreitext} onChange={value => patchRow(index, { melderFreitext: value })} /> : <div />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Gültig ab" type="date" value={row.gueltigVonDatum} onChange={value => patchRow(index, { gueltigVonDatum: value })} />
              <Field label="Uhrzeit (optional)" type="time" value={row.gueltigVonZeit} onChange={value => patchRow(index, { gueltigVonZeit: value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Gültig bis (optional)" type="date" value={row.gueltigBisDatum} onChange={value => patchRow(index, { gueltigBisDatum: value, ...(value ? {} : { gueltigBisZeit: '' }) })} />
              <Field label="Uhrzeit (optional)" type="time" value={row.gueltigBisZeit} disabled={!row.gueltigBisDatum} onChange={value => patchRow(index, { gueltigBisZeit: value })} />
            </div>
          </div>
        </div>)}
        <button type="button" onClick={addRow} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><Plus className="w-4 h-4" /> Weitere Straße hinzufügen</button>
        <label className="block text-xs font-medium text-gray-600">Anmerkungen<textarea className={`${inputClass} min-h-20 resize-y`} value={anmerkung} onChange={event => setAnmerkung(event.target.value)} /></label>
        {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
        <Actions saving={saving} close={closeForm} save={saveBericht} />
      </div>
    </Modal> : null}

    {showStammdaten ? <Modal title={`${showStammdaten === 'strassen' ? 'Straßen' : showStammdaten === 'auftraggeber' ? 'Auftraggeber' : 'Meldende'} verwalten`} close={() => setShowStammdaten(null)}>
      <div className="space-y-2">
        {(showStammdaten === 'strassen' ? strassen : showStammdaten === 'auftraggeber' ? auftraggeber : melder).map(item => <div key={item.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2"><span className={`text-sm ${item.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{item.name}</span><button type="button" onClick={() => void toggleStammdatum(showStammdaten, item)} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${item.active ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-800'}`}>{item.active ? 'Deaktivieren' : 'Aktivieren'}</button></div>)}
      </div>
      <div className="flex gap-2 pt-2"><input className={`${inputClass} mt-0 flex-1`} placeholder="Neuer Eintrag" value={neuerName} onChange={event => setNeuerName(event.target.value)} /><button type="button" onClick={() => void addStammdatum(showStammdaten)} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg">Hinzufügen</button></div>
    </Modal> : null}
  </div>
}

function StammdatenCard({ title, items, onManage }: { title: string; items: StrassenzustandStammdatum[]; onManage: () => void }) {
  const activeCount = items.filter(item => item.active).length
  return <button type="button" onClick={onManage} className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50">
    <p className="text-xs font-semibold text-gray-500">{title}</p>
    <p className="font-bold text-gray-900 mt-1">{activeCount} aktiv</p>
    <p className="text-xs text-blue-700 mt-1">Bearbeiten →</p>
  </button>
}
