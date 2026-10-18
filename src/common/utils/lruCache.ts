// Bounded, access-ordered storage. Eviction only drops the cache reference;
// visible pages and the playback queue keep their own objects.
export class LruCache<K, V> {
  private readonly entries = new Map<K, { value: V, weight: number }>()
  private weight = 0

  constructor(private readonly capacity: number, private readonly maxWeight = Infinity, private readonly weigh: (value: V) => number = () => 1) {}

  get size() { return this.entries.size }
  has(key: K) { return this.entries.has(key) }
  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V) {
    this.delete(key)
    const weight = Math.max(1, this.weigh(value))
    if (this.capacity < 1 || !Number.isFinite(weight) || weight > this.maxWeight) return this
    this.entries.set(key, { value, weight })
    this.weight += weight
    while (this.entries.size > this.capacity || this.weight > this.maxWeight) this.delete(this.entries.keys().next().value!)
    return this
  }

  delete(key: K) {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.weight -= entry.weight
    return this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
    this.weight = 0
  }
}
