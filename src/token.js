const fs = require('fs')
const jwt = require('jsonwebtoken')
const { promisify } = require('util')

function generateToken(user, duration, config) {
  let claims = {
    sub: user,
    exp: Math.ceil((new Date()).getTime() / 1000) + duration
  }
  if (config.issuer) claims.iss = config.issuer
  if (config.audience) claims.aud = config.audience

  let options = {
    algorithm: 'HS256',
  }

  return new Promise((resolve, reject) => {
    jwt.sign(claims, config.secret, options, (err, token) => {
      (err) ? reject(err) : resolve(token)
    })
  })
}

async function getToken() {
  let user = process.argv[2]
  let duration = parseInt(process.argv[3] || '86400') // 24 hours
  let configFile = await promisify(fs.readFile)(
    process.argv[4] || 'config.json')
  let config = JSON.parse(configFile)
  let token = await generateToken(user, duration, config)
  console.log(token)
}

if (require.main === module) getToken()

