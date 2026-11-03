import logo from '../assets/planora-mark-lg.png'
import { cn } from '../lib/cn'

interface AppLogoProps {
  size?: number
  className?: string
  alt?: string
}

export function AppLogo({ size = 64, className, alt = 'Planora' }: AppLogoProps) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 overflow-hidden', className)}
      style={{ width: size, height: size }}
    >
      <img
        src={logo}
        alt={alt}
        width={size}
        height={size}
        className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{ width: size * 1.22, height: size * 1.22 }}
        draggable={false}
      />
    </span>
  )
}
