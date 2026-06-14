import { useEffect, useState } from 'react'
import './SplashScreen.css'

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('enter')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 100)
    const t2 = setTimeout(() => setPhase('exit'), 2200)
    const t3 = setTimeout(() => onDone(), 3000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onDone])

  const letters = 'micropixels'.split('')

  return (
    <div className={`splash ${phase}`}>
      <div className="splash-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="splash-particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${1.5 + Math.random() * 2}s`,
              width: `${2 + Math.random() * 3}px`,
              height: `${2 + Math.random() * 3}px`,
            }}
          />
        ))}
      </div>

      <div className="splash-content">
        <div className="splash-logo">
          {letters.map((char, i) => (
            <span
              key={i}
              className="splash-char"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            >
              {char}
            </span>
          ))}
        </div>
        <p className="splash-subtitle">image compression toolkit</p>
        <div className="splash-loader">
          <div className="splash-loader-track">
            <div className="splash-loader-fill" />
          </div>
        </div>
      </div>
    </div>
  )
}
