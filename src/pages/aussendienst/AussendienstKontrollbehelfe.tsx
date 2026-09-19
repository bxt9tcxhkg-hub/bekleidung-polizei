import UnterlagenRegister from '../../components/UnterlagenRegister'

export default function AussendienstKontrollbehelfePage() {
  return <UnterlagenRegister
    bereich="aussendienst"
    title="Kontrollbehelfe"
    description="Formulare, Vorlagen und Arbeitshilfen für die Streife."
    areaTagline="Operativer Bereich · Außendienst"
    backTo="/aussendienst"
    backLabel="Zum Außendienst"
  />
}
