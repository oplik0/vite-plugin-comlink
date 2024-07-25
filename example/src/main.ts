import { endpointSymbol } from "@opliko/vite-plugin-comlink/symbol";

const w = new ComlinkWorker<typeof import('./worker')>(new URL("./worker.ts", import.meta.url))
const x = w[endpointSymbol]

console.log(x)
console.log(await w.add(5,3))

const w2 = new ComlinkWorker<typeof import('./worker2-1')>(new URL("./worker2-1.ts", import.meta.url))
console.log(await w2.add(6,3))

const w3 = new ComlinkWorker<typeof import('./worker3.do')>(new URL("./worker3.do", import.meta.url))
console.log(await w3.add(6,4))

await import("./a/a/w4.ts")
