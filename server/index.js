// Local / any Node host:  npm start   →  http://localhost:4000
import app from './src/app.js'
import { config } from './src/config.js'

app.listen(config.port, () => {
  console.log(`Payment server on http://localhost:${config.port}  ·  Razorpay mode: ${config.mode.toUpperCase()}`)
  if (config.problems.length) console.warn('⚠ Setup problems:\n  - ' + config.problems.join('\n  - '))
})
