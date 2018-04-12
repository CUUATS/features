const { Pool } = require('pg')


class BaseUser {
  constructor(name, options) {
    this.name = name
  }

  forbidden(res) {
    res.status(403).json({error: 'forbidden'})
  }

  doesNotExist(res) {
    res.status(404).json({error: 'does not exist'})
  }

  serverError(res) {
    res.status(500).json({error: 'server error'})
  }

  middleware(req, res, next) {
    next()
  }

  getTable(req, res) {
    this.doesNotExist(res)
  }

  postTable(req, res) {
    this.doesNotExist(res)
  }

  getFeature(req, res) {
    this.doesNotExist(res)
  }

  patchFeature(req, res) {
    this.doesNotExist(res)
  }

  deleteFeature(req, res) {
    this.doesNotExist(res)
  }
}

module.exports = BaseUser
