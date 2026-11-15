/* Простое хранилище в памяти. В Node 25 есть встроенный localStorage (экспериментальный), который
   мешает jsdom: clear() и прочее может не существовать. Для тестов подменяем его полноценной заглушкой. */
export function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: k => (m.has(k) ? (m.get(k) as string) : null),
    key: i => [...m.keys()][i] ?? null,
    removeItem: k => { m.delete(k) },
    setItem: (k, v) => { m.set(k, String(v)) },
  }
}
