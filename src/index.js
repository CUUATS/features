const bodyParser = require('body-parser')
const express = require('express')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const { promisify } = require('util')
const PostgresUser = require('./postgres.js')
const utils = require('./utils.js')


class Features {
  constructor(config) {
    this.config = config
    this.users = this.createUsers(config.users)
    this.app = express()

    this.app.use(bodyParser.json())
    this.app.param('user', this.userParam.bind(this))
    this.app.param('table', this.tableParam.bind(this))
    this.app.param('fid', this.fidParam.bind(this))

    let userMw = this.userMiddleware.bind(this)

    this.app.get('/:user/:table', userMw,
                 (req, res) => req.user.getTable(req, res))
    this.app.post('/:user/:table', userMw,
                  (req, res) => req.user.postTable(req, res))
    this.app.get('/:user/:table/:fid', userMw,
                 (req, res) => req.user.getFeature(req, res))
    this.app.patch('/:user/:table/:fid', userMw,
                   (req, res) => req.user.patchFeature(req, res))
    this.app.delete('/:user/:table/:fid', userMw,
                    (req, res) => req.user.deleteFeature(req, res))
  }

  async serve() {
    this.app.listen(this.config.port, () =>
                    console.log('Ready to handle requests'))
  }

  getTableName(req) {
    return utils.sqlSanitize(req.params.table || '')
  }

  createUsers(configs) {
    let users = {}

    Object.keys(configs).forEach((name) => {
      let config = configs[name]

      if (!config.auth || !config.auth.secret)
        throw 'User ' + name + ' is missing an authorization secret'

      if (config.type === 'postgres') {
        users[name] = new PostgresUser(name, config.options)
      } else {
        throw 'Invalid user type: ' + config.type
      }
    })

    return users
  }

  isAuthorized(req, username, auth) {
    let token = null
    let headers = req.headers
    if (headers && headers.authorization) {
      let parts = headers.authorization.split(' ')
      if (parts.length === 2 && parts[0] == 'Bearer') token = parts[1]
    } else if (req.query && req.query.token) {
      token = req.query.token
    }

    if (!token) return Promise.resolve(false)

    return new Promise((resolve, reject) => {
      jwt.verify(token, auth.secret, {
        algorithms: ['HS256'],
        audience: auth.audience,
        issuer: auth.issuer
      }, (err, decoded) => {
        (err) ? reject(err) : resolve(decoded.sub === username)
      })
    })
  }

  async userParam(req, res, next, name) {
    const userConfig = this.config.users[name]
    if (!userConfig) return res.status(404).json({error: 'invalid user'})

    let authorized = await this.isAuthorized(req, name, userConfig.auth)
    if (!authorized) return res.status(403).json({error: 'invalid token'})

    req.user = this.users[name]
    return next()
  }

  tableParam(req, res, next, table) {
    req.table = this.getTableName(req)
    if (!req.table) return res.status(404).json({error: 'invalid table'})

    return next()
  }

  fidParam(req, res, next, fid) {
    req.fid = parseInt(req.params.fid)
    if (isNaN(req.fid)) return res.status(404).json({error: 'invalid fid'})

    return next()
  }

  userMiddleware(req, res, next) {
    req.user.middleware(req, res, next)
  }
}

async function startServer() {
  let configFile = await promisify(fs.readFile)(
    process.argv[2] || 'config.json')
  let server = new Features(JSON.parse(configFile))
  server.serve()
}

if (require.main === module) startServer()

module.exports = Features;
