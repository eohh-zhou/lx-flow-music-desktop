import { checkCancelled } from './providers'

export class SoftwareBudgetExhausted extends Error {}

// One shared queue covers catalogue reads and all three music searches.
export class SoftwareRequestBudget {
  requests = 0
  private active = 0
  private readonly deadline: number
  private readonly pending: Array<{ start: () => Promise<void>, reject: (error: Error) => void }> = []
  private readonly abort = () => {
    for (const task of this.pending.splice(0)) task.reject(new Error('ai_recommend__error_cancelled'))
  }

  constructor(private readonly signal: AbortSignal, private readonly limit = 22, duration = 30000) {
    this.deadline = Date.now() + duration
    signal.addEventListener('abort', this.abort, { once: true })
  }

  async run<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.pending.push({ start: async() => { try { resolve(await request()) } catch (error) { reject(error) } }, reject })
      this.pump()
    })
  }

  private pump() {
    while (this.active < 2 && this.pending.length) {
      const task = this.pending.shift()!
      try {
        checkCancelled(this.signal)
        if (this.requests >= this.limit || Date.now() >= this.deadline) throw new SoftwareBudgetExhausted()
      } catch (error) { task.reject(error as Error); continue }
      this.requests++; this.active++
      void task.start().finally(() => { this.active--; this.pump() })
    }
  }

  close() { this.signal.removeEventListener('abort', this.abort) }
}
