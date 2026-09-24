import { useState } from 'react'
import { AlertTriangle, Car, CheckCircle2, Circle, FileCheck2, ListChecks, Mail, Navigation, Search, ShieldCheck, Wrench } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstUebersicht() {
  const ctx = useOutletContext<AussendienstContext>()
  const [changingVehicle, setChangingVehicle] = useState(false)
  if (!ctx.ownAssignment) return null

  const functionLabel = ctx.ownFunction?.label ?? ctx.ownAssignment.function.toUpperCase()
  const openOrders = ctx.openOrders
  const currentIncidents = [...ctx.ownIncidents, ...ctx.supportedIncidents]
  const incidentList = (
    <EntryOrIncidentList
      kind="incidents"
      incidents={currentIncidents}
      baustellen={ctx.baustellen}
      ownVehicleId={ctx.ownVehicle?.id ?? null}
      incidentSupports={ctx.incidentSupports}
      takeOverIncident={ctx.takeOverIncident}
      releaseIncidentTakeover={ctx.releaseIncidentTakeover}
      supportIncident={ctx.supportIncident}
      stopSupportingIncident={ctx.stopSupportingIncident}
      completeIncident={ctx.completeIncident}
      reopenIncident={ctx.reopenIncident} incidentContextSummary={ctx.incidentContextSummary}
    />
  )

  return <div className="space-y-4 mb-6">
    <section className="rounded-2xl border border-blue-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Meine Streife</p>
          <h2 className="text-xl font-bold text-gray-900 mt-1">{functionLabel}</h2>
          <p className="text-sm text-gray-600 mt-1">
            {ctx.ownVehicle ? <>{ctx.ownVehicle.call_sign || ctx.ownVehicle.name}{ctx.ownVehicle.license_plate ? ` · ${ctx.ownVehicle.license_plate}` : ''}</> : 'Kein Fahrzeug zugewiesen'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Streifenpartner: {ctx.patrolMates.map(item => item.profiles?.name).filter(Boolean).join(', ') || 'keine weitere Person zugeordnet'}</p>
        </div>
        <button type="button" onClick={() => setChangingVehicle(value => !value)} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
          <Car className="w-4 h-4" /> Fahrzeug ändern
        </button>
      </div>
      {changingVehicle ? <div className="mt-3 max-w-md">
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          value={ctx.ownVehicle?.id ?? ''}
          onChange={event => { void ctx.setDutyVehicle(event.target.value); setChangingVehicle(false) }}
          aria-label="Fahrzeug für diesen Dienst"
        >
          <option value="">Kein Fahrzeug</option>
          {ctx.availableVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>
            {vehicle.call_sign || vehicle.name}{vehicle.license_plate ? ` · ${vehicle.license_plate}` : ''}{vehicle.operational_status !== 'verfuegbar' ? ' · derzeit nicht verfügbar' : ''}
          </option>)}
        </select>
        <p className="text-[11px] text-gray-500 mt-1">Die Änderung gilt nur für den heutigen Dienst. Nicht verfügbare Fahrzeuge werden nicht als neue Auswahl angeboten.</p>
      </div> : null}
    </section>

    {ctx.criticalItems.length > 0 ? <section className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-700" /><div><p className="text-xs font-bold uppercase tracking-wider text-red-700">Dringend beachten</p><div className="mt-2 space-y-2">{ctx.criticalItems.map(item => <div key={item.id}><p className="text-sm font-bold text-red-950">{item.title}</p>{item.description ? <p className="text-xs text-red-800">{item.description}</p> : null}</div>)}</div></div></div>
    </section> : null}

    {currentIncidents.length > 0 ? <section>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div><p className="text-xs font-bold uppercase tracking-wider text-red-700">Jetzt</p><h2 className="text-lg font-bold text-gray-900">Aktuelle Einsätze</h2></div>
        <Link to="/aussendienst/einsaetze" className="text-xs font-semibold text-blue-700 hover:underline">Alle ansehen</Link>
      </div>
      {incidentList}
    </section> : null}

    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100"><h2 className="font-bold text-gray-900 flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-blue-700" /> Heutige Bescheide</h2><p className="text-xs text-gray-500 mt-1">Kein Kontrollauftrag – nur zur Überprüfung vor Ort.</p></div>
      {ctx.heutigeBescheide.length === 0 ? <p className="p-4 sm:p-5 text-sm text-gray-500">Heute wurde kein Bescheid für Straßenmusik oder Straßenkunst ausgestellt.</p> : <div className="divide-y divide-gray-100">{ctx.heutigeBescheide.map(item => {
        const name = item.person ? `${item.person.vorname} ${item.person.nachname}`.trim() : item.subject
        return <div key={item.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-gray-900">{name}</p><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'entzogen' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{item.status === 'entzogen' ? 'Zurückgezogen' : item.kind === 'bescheid_strassenmusik' ? 'Straßenmusik' : 'Straßenkunst'}</span></div><p className="text-sm text-gray-600 mt-1">Geb. {item.person?.birth_date ? new Date(item.person.birth_date).toLocaleDateString('de-AT') : 'nicht erfasst'}{item.reference ? ` · GZ ${item.reference}` : ''}</p></div>{item.status !== 'entzogen' ? <button type="button" disabled={ctx.saving} onClick={() => void ctx.bescheidZurueckziehen(item.id)} className="min-h-11 px-4 rounded-lg border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-60">Verstoß · zurückziehen</button> : null}</div>
      })}</div>}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-blue-700" /> Fahrzeugcheck</h2>
          <p className="text-xs text-gray-500 mt-1">Vor Dienstbeginn prüfen. Danach bleibt der Punkt nur noch als Status sichtbar.</p>
        </div>
        {ctx.ownVehicle ? <Link to="/aussendienst/fahrzeug" className="text-xs font-semibold text-blue-700 hover:underline">Fahrzeugdetails</Link> : null}
      </div>
      {!ctx.ownVehicle ? <p className="text-sm text-amber-700 mt-3">Bitte zuerst ein Fahrzeug auswählen.</p>
      : ctx.ownCheck ? <div className={`mt-3 rounded-xl px-4 py-3 flex items-start gap-2 text-sm ${ctx.ownCheck.status === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
          {ctx.ownCheck.status === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <div><p className="font-semibold">{ctx.ownCheck.status === 'ok' ? 'Fahrzeugcheck erledigt' : 'Mangel gemeldet'}</p>{ctx.ownCheck.note ? <p className="mt-0.5">{ctx.ownCheck.note}</p> : null}</div>
        </div>
      : <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={ctx.saving} onClick={() => void ctx.saveVehicleCheck('ok', '')} className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">
            In Ordnung
          </button>
          <button type="button" onClick={() => ctx.setShowMangelForm(true)} className="inline-flex items-center gap-2 border border-amber-300 text-amber-800 text-sm font-medium px-4 py-2.5 rounded-lg">
            <Wrench className="w-4 h-4" /> Mangel
          </button>
        </div>}
      {ctx.showMangelForm && !ctx.ownCheck ? <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="Was fehlt oder ist beschädigt?" value={ctx.checkNote} onChange={event => ctx.setCheckNote(event.target.value)} />
        <button type="button" disabled={ctx.saving || !ctx.checkNote.trim()} onClick={() => void ctx.saveVehicleCheck('mangel', ctx.checkNote)} className="bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">Melden</button>
      </div> : null}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div><h2 className="font-bold text-gray-900 flex items-center gap-2"><ListChecks className="w-4 h-4 text-blue-700" /> Kontrollaufträge</h2><p className="text-xs text-gray-500 mt-1">Nur offene Aufträge für die heutige Funktion.</p></div>
        <Link to="/aussendienst/kontrollauftraege" className="text-xs font-semibold text-blue-700 hover:underline">Alle</Link>
      </div>
      {openOrders.length === 0 ? <p className="text-sm text-gray-500 p-4 sm:p-5">Keine offenen Kontrollaufträge.</p> : <div className="divide-y divide-gray-100">{openOrders.map(item => <div key={item.id} className="p-4 sm:p-5 flex items-start gap-3">
        <button type="button" onClick={() => void ctx.toggleKontrollauftragErledigt(item)} className="mt-0.5 text-gray-300 hover:text-green-600 flex-shrink-0" aria-label="Als erledigt markieren"><Circle className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-gray-900">{item.title}</p>{item.zeitfenster ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{item.zeitfenster}</span> : null}</div>
          {item.description ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.description}</p> : null}
          {item.location ? <p className="text-xs text-gray-500 mt-1">{item.location}</p> : null}
          <div className="flex flex-wrap gap-3 mt-2">
            {item.location_lat !== null && item.location_lng !== null ? <a href={`https://www.google.com/maps/dir/?api=1&destination=${item.location_lat},${item.location_lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><Navigation className="w-3.5 h-3.5" /> Navigation</a> : null}
            <button type="button" onClick={() => void ctx.toggleKontrollauftragErledigt(item)} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"><CheckCircle2 className="w-3.5 h-3.5" /> Erledigt</button>
          </div>
        </div>
      </div>)}</div>}
    </section>

    {currentIncidents.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center">
      <CheckCircle2 className="w-7 h-7 text-gray-300 mx-auto mb-2" />
      <p className="font-medium text-gray-700">Keine eigenen laufenden Einsätze</p>
      <p className="text-sm text-gray-500 mt-1">Noch nicht zugewiesene Einsätze stehen unter „Einsätze“ als verfügbarer Pool.</p>
    </section> : null}

    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Schnellzugriff</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Link to="/aussendienst/rsa-rsb" className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Mail className="w-4 h-4 text-blue-700" /> RSa/RSb</Link>
        <Link to="/aussendienst/personen" className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Search className="w-4 h-4 text-blue-700" /> Personen</Link>
        <Link to="/aussendienst/kontrollbehelfe" className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><ListChecks className="w-4 h-4 text-blue-700" /> Behelfe</Link>
        <Link to="/aussendienst/fahrzeug" className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Car className="w-4 h-4 text-blue-700" /> Fahrzeug</Link>
      </div>
    </section>
  </div>
}
