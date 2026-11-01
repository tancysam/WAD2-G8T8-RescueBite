
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const motionState = {
  preloaderPlayed: false
}

export const reveal = {
  mounted(el) {
    if (prefersReducedMotion()) return

    if (CSS.supports('animation-timeline: view()')) {
      el.classList.add('rb-reveal')
      return
    }

    el.classList.add('rb-reveal-wait')
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        el.classList.remove('rb-reveal-wait')
        el.classList.add('rb-reveal-in')
        observer.disconnect()
      }
    }, { threshold: 0.15 })
    observer.observe(el)
    el._rbRevealObserver = observer
  },
  unmounted(el) {
    if (el._rbRevealObserver) el._rbRevealObserver.disconnect()
  }
}
