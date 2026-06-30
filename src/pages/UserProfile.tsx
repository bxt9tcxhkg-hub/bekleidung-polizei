import { useEffect, useState } from 'react'
import { UserCircle, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sizeLabel } from '../lib/sizes'

type SizeOptGroup = { group: string; sizes: string[] }
type SizeField = { key: string; label: string; options: (string | SizeOptGroup)[] }

const MALE_SIZE_FIELDS: SizeField[] = [
  {
    key: 'hose', label: 'Hosengröße',
    options: [
      { group: 'Untersetzt', sizes: ['U22','U23','U24','U25','U26','U27','U28','U29','U30','U31','U32'] },
      { group: 'Normal',     sizes: ['N44','N46','N48','N50','N52','N54','N56','N58','N60','N62','N64'] },
      { group: 'Schlank',    sizes: ['S88','S90','S94','S98','S102','S106','S110','S114','S118','S122','S126'] },
    ],
  },
  {
    key: 'jacke', label: 'Jackengröße',
    options: [
      { group: 'Weite I',  sizes: ['44I','46I','48I','50I','52I','54I','56I','58I','60I'] },
      { group: 'Weite II', sizes: ['44II','46II','48II','50II','52II','54II','56II','58II','60II'] },
    ],
  },
  { key: 'hemd',       label: 'Hemdgröße',            options: ['37/38','39/40','41/42','43/44','45/46','47/48','49/50','51/52'] },
  { key: 'schuh',      label: 'Schuhgröße',            options: ['36','37','38','39','40','41','42','43','44','45','46','47','48','49'] },
  { key: 'kopf',       label: 'Kopfgröße',             options: ['52','53','54','55','56','57','58','59','60','61','62'] },
  { key: 'handschuh',  label: 'Handschuhgröße',        options: ['7.5','8','8.5','9','9.5','10','11','11.5','12'] },
  { key: 'strickware', label: 'Strickware/Unterbekleidung', options: ['44','46','48','50','52','54','56','58','60','62'] },
]

const FEMALE_SIZE_FIELDS: SizeField[] = [
  {
    key: 'hose', label: 'Hosengröße',
    options: [
      { group: 'Kurz',   sizes: ['K16','K17','K18','K19','K20','K21','K22','K23','K24','K25'] },
      { group: 'Normal', sizes: ['N34','N36','N38','N40','N42','N44','N46','N48','N50'] },
      { group: 'Lang',   sizes: ['L68','L72','L76','L80','L84','L88','L92','L96','L100'] },
    ],
  },
  {
    key: 'jacke', label: 'Jackengröße',
    options: [
      { group: 'Weite I',  sizes: ['34I','36I','38I','40I','42I','44I'] },
      { group: 'Weite II', sizes: ['34II','36II','38II','40II','42II','44II'] },
    ],
  },
  { key: 'hemd',       label: 'Blusen-/Hemdgröße',    options: ['34','36','38','40','42','44','46','48'] },
  { key: 'schuh',      label: 'Schuhgröße',            options: ['36','37','38','39','40','41','42','43','44','45','46','47','48'] },
  { key: 'kopf',       label: 'Kopfgröße',             options: ['52','53','54','55','56','57','58','59','60','61','62'] },
  { key: 'handschuh',  label: 'Handschuhgröße',        options: ['6.5','7','7.5','8','8.5','9'] },
  { key: 'strickware', label: 'Strickware/Unterbekleidung', options: ['34','36','38','40','42','44','46'] },
]

export default function UserProfile() {
  const { profile, isStrictAdmin } = useAuth()
  const [form, setForm] = useState({ name: '', dienstnummer: '', gender: 'male' as 'male' | 'female' })
  const [sizePref, setSizePref] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) {
      setForm({ name: profile.name ?? '', dienstnummer: profile.dienstnummer ?? '', gender: profile.gender ?? 'male' })
      setSizePref(profile.size_preferences ?? {})
    }
  }, [profile])

  async function save() {
    setError('')
    setSuccess(false)
    if (!form.name.trim()) { setError('Name ist ein Pflichtfeld.'); return }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim(),
        dienstnummer: form.dienstnummer.trim() || null,
        gender: form.gender,
        size_preferences: sizePref,
      })
      .eq('id', profile!.id)
    if (error) setError(error.message)
    else setSuccess(true)
    setSaving(false)
  }

  function setSizeVal(key: string, val: string) {
    setSizePref(p => {
      const next = { ...p }
      if (val) next[key] = val
      else delete next[key]
      return next
    })
  }

  const sizeFields = form.gender === 'female' ? FEMALE_SIZE_FIELDS : MALE_SIZE_FIELDS

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mein Profil</h1>
        <p className="text-gray-500 text-sm mt-1">Persönliche Daten bearbeiten</p>
      </div>

      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 bg-gray-50">
            <div className="bg-blue-100 p-3 rounded-full">
              <UserCircle className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{profile?.name || profile?.username}</p>
              <p className="text-xs text-gray-500">{profile?.username}</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Vor- und Nachname"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dienstnummer</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.dienstnummer}
                onChange={e => setForm(f => ({ ...f, dienstnummer: e.target.value }))}
                placeholder="z. B. 1234"
              />
            </div>
            {!isStrictAdmin && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Geschlecht</label>
                <div className="flex gap-2">
                  {(['male', 'female'] as const).map(g => (
                    <button key={g} type="button" onClick={() => setForm(f => ({ ...f, gender: g }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.gender === g ? (g === 'male' ? 'bg-blue-700 text-white border-blue-700' : 'bg-pink-600 text-white border-pink-600') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                      {g === 'male' ? 'Männlich' : 'Weiblich'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Bestimmt welche Produkte im Katalog angezeigt werden</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Organisation</label>
              <p className="text-sm text-gray-700 px-3 py-2 bg-gray-50 rounded-lg">{profile?.organisation ?? 'Stadtpolizei'}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Benutzername</label>
              <p className="text-sm text-gray-500 px-3 py-2 bg-gray-50 rounded-lg">{profile?.username}</p>
              <p className="text-xs text-gray-400 mt-1">Benutzername kann nicht geändert werden</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rollen</label>
              <div className="flex gap-2 flex-wrap">
                {(profile?.roles ?? []).map(r => (
                  <span key={r} className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 capitalize">{r}</span>
                ))}
              </div>
            </div>

            {!isStrictAdmin && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-800 mb-0.5">Meine Größen</p>
                <p className="text-xs text-gray-500 mb-4">Werden beim Bestellen automatisch vorausgewählt.</p>
                <div className="grid grid-cols-2 gap-3">
                  {sizeFields.map(field => (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                      <select
                        value={sizePref[field.key] ?? ''}
                        onChange={e => setSizeVal(field.key, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">– nicht angegeben –</option>
                        {field.options.map(opt =>
                          typeof opt === 'string'
                            ? <option key={opt} value={opt}>{opt}</option>
                            : <optgroup key={opt.group} label={opt.group}>
                                {opt.sizes.map(s => (
                                  <option key={s} value={s}>{sizeLabel(s, true)}</option>
                                ))}
                              </optgroup>
                        )}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">Profil gespeichert.</p>}
          </div>

          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-medium px-5 py-2 rounded-lg text-sm disabled:opacity-60 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
