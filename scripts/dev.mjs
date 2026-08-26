import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const ace = fileURLToPath(new URL('../ace', import.meta.url))

const processes = [
  start('server', ['serve', '--hmr']),
  start('worker', ['queue:work']),
]

let stopping = false

function start(name, args) {
  const child = spawn(process.execPath, [ace, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
  })

  child.on('exit', (code, signal) => {
    if (stopping) return

    stopping = true
    console.error(
      `${name} exited${signal ? ` from ${signal}` : ` with code ${code ?? 1}`}; stopping the other process.`
    )
    stopAll(signal ?? undefined)
    process.exitCode = code ?? 1
  })

  child.on('error', (error) => {
    if (stopping) return

    stopping = true
    console.error(`Unable to start ${name}:`, error)
    stopAll()
    process.exitCode = 1
  })

  return child
}

function stopAll(signal = 'SIGTERM') {
  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (stopping) return

    stopping = true
    stopAll(signal)
  })
}
