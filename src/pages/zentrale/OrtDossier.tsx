import { useEffect, useState } from 'react'
import { personDisplayName } from '../../lib/register'
import { supabase } from '../../lib/supabase'
import type { OperationalObject, OperationalPerson } from '../../lib/types'

function tokens(value: string): string[] {
  return value.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(part => part.length >= 2)
}

function matchesAddress(query: string, ...fields: Array<string | null | undefined>): boolean {
  const hay = tokens(fields.filter(Boolean).join(' '))
  if (hay.length === 0) return false
  const parts = tokens(query)
  if (parts.length === 0) return false
  return parts.every(part => hay.some(item => item.includes(part) || part.includes(item)))
}

export function OrtDossier({ street, houseNumber, location }: { street: string; houseNumber: string; location: string }) {
  const query = [street, houseNumber].filter(Boolean).join(' ').trim() || location.trim()
  const [objects, setObjects] = useState<OperationalObject[]>([])
  const [personen, setPersonen] = useState<OperationalPerson[]>([])

  useEffect(() => {
    if (query.length < 4) { setObjects([]); setPersonen([]); return }
    const timer = setTimeout(() => {
      const escaped = query.replace(/[\\%_]/g, char => `\\${char}`)
      void Promise.all([
        supabase.from('operational_objects').select('*').or(`address.ilike.%${escaped}%,strasse.ilike.%${escaped}%,label.ilike.%${escaped}%`).limit(20),
        supabase.from('operational_persons').select('*, home_object:operational_objects(id,address,label,strasse,hausnummer,plz,ort)').limit(80),
      ]).then(([objectResult, personResult]) => {
        const foundObjects = ((objectResult.data ?? []) as OperationalObject[]).filter(item => matchesAddress(query, item.address, item.label, item.strasse, item.hausnummer))
        setObjects(foundObjects.slice(0, 5))
        const objectIds = new Set(foundObjects.map(item => item.id))
        const foundPersons = ((personResult.data ?? []) as OperationalPerson[]).filter(item =>
          (item.home_object_id && objectIds.has(item.home_object_id))
          || matchesAddress(query, item.home_object?.address, item.home_object?.strasse, item.home_object?.hausnummer, item.home_object?.label)
        )
        setPersonen(foundPersons.slice(0, 8))
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  if (query.length < 4 || (objects.length === 0 && personen.length === 0)) return null

  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
    <p className="text-xs font-bold text-slate-800">Zu diesem Ort</p>
    {objects.map(item => (
      <p key={item.id} className="text-sm text-slate-900">
        <span className="font-semibold">{item.label || item.address}</span>
        {item.label && item.address ? <span className="text-slate-600"> · {item.address}</span> : null}
        {item.note ? <span className="block text-xs text-slate-600">{item.note}</span> : null}
      </p>
    ))}
    {personen.length > 0 ? <div>
      <p className="text-xs font-semibold text-slate-700">Parteien an dieser Anschrift</p>
      <ul className="mt-1 space-y-0.5">{personen.map(item => (
        <li key={item.id} className="text-sm text-slate-900">{personDisplayName(item)}{item.birth_date ? ` · * ${new Date(item.birth_date).toLocaleDateString('de-AT')}` : ''}</li>
      ))}</ul>
    </div> : null}
  </div>
}
