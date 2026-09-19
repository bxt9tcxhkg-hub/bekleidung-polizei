import { Outlet } from 'react-router-dom'
import PortalChrome from './PortalChrome'

export default function StammdatenLayout() {
  return (
    <PortalChrome wide>
      <Outlet />
    </PortalChrome>
  )
}
