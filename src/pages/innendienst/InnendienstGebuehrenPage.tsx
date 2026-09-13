import { useAuth } from '../../contexts/AuthContext'
import InnendienstGebuehrenPanel from './InnendienstGebuehren'

export default function InnendienstGebuehrenPage() {
  const { isGenehmiger } = useAuth()
  return <InnendienstGebuehrenPanel isGenehmiger={isGenehmiger} />
}
