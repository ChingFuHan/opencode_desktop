import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export interface TerminalHandle {
  write: (data: string) => void
  clear: () => void
}

export const TerminalPanel = forwardRef<TerminalHandle>(function TerminalPanel(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const term = new Terminal({
      convertEol: true,
      fontSize: 12,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      theme: { background: '#111111' },
      scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current!)
    fit.fit()
    termRef.current = term

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* container hidden */
      }
    })
    observer.observe(containerRef.current!)

    return () => {
      observer.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [])

  useImperativeHandle(ref, () => ({
    write: (data: string) => termRef.current?.write(data),
    clear: () => termRef.current?.clear()
  }))

  return <div className="terminal-container" ref={containerRef} />
})
