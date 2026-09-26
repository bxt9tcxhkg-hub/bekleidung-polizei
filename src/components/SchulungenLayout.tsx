import { Outlet } from 'react-router-dom'
import PortalChrome from './PortalChrome'

export default function SchulungenLayout() {
  return (
    <PortalChrome wide>
      <Outlet />
    </PortalChrome>
  )
}
