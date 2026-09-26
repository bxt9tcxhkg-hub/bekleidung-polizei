import { Outlet } from 'react-router-dom'
import PortalChrome from './PortalChrome'

export default function RsaRsbLayout() {
  return (
    <PortalChrome wide>
      <Outlet />
    </PortalChrome>
  )
}
