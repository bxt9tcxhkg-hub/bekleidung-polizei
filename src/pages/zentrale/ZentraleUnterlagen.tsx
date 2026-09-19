import UnterlagenRegister from '../../components/UnterlagenRegister'

export default function ZentraleUnterlagenPage() {
  return <UnterlagenRegister
    bereich="zentrale"
    title="Unterlagen"
    description="Formulare, Vorlagen und operative Arbeitshilfen."
    areaTagline="Operativer Bereich · Zentrale"
    backTo="/zentrale"
    backLabel="Zur Zentrale"
  />
}
