import dynamic from 'next/dynamic'
import { NavigationHUD } from '../components/NavigationHUD'
import { ArchiveOverlay } from '../components/ArchiveOverlay'

// Canvas uses WebGL — must be excluded from SSR
const CanvasContainer = dynamic(
  () => import('../components/CanvasContainer').then((m) => ({ default: m.CanvasContainer })),
  { ssr: false },
)

export default function HomePage() {
  return (
    <>
      <CanvasContainer />
      <NavigationHUD />
      <ArchiveOverlay />
    </>
  )
}
