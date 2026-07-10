import { useUIStore } from '@/shared/model/store';

export default function Vignette() {
  const opacity = useUIStore((s) => s.vignetteOpacity);
  return <div id="vignette" style={{ opacity }} />;
}
