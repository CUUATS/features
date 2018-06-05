const { Pool } = require('pg')
const BaseUser = require('./base.js')
const utils = require('./utils.js')


class PostgresUser extends BaseUser {
  constructor(name, options) {
    super(name, options)
    this.options = options
    this.table_info_cache = {}

    this.pool = new Pool({
      user: options.user,
      host: options.host,
      database: options.database,
      password: options.password,
      port: options.port,
      ssl: options.ssl
    })
  }

  async query(req, res, sql, params, collection) {
    sql = sql.replace('{table}', req.table)

    let dbRes
    try {
      dbRes = await this.pool.query(sql, params)
    } catch (e) {
      let err = e.toString()
      console.error(err)
      if (/permission denied/.test(err)) {
        this.forbidden(res)
      } else if (/column ".*" of relation ".*" does not exist/.test(err)) {
        let matches = err.match(/column "(.*)" of relation/)
        this.badRequest(res, 'column "' + matches[1] + '" does not exist')
      } else if (/relation ".*" does not exist/.test(err)) {
        this.doesNotExist(res)
      } else {
        this.serverError(res)
      }
      return
    }

    if (dbRes.command === 'INSERT') {
      res.json({rows: dbRes.rowCount})
    } else if (dbRes.command === 'SELECT') {
      let info = await this.getTableInfo(req)
      let features = dbRes.rows.map((row) =>
        this.rowToFeature(row, info.pk, info.geom))
      if (collection) {
        res.json({
          type: 'FeatureCollection',
          features: features
        })
      } else {
        res.json(features[0])
      }
    }
  }

  async getTableInfo(req) {
    let info = this.table_info_cache[req.table]
    if (info !== undefined) return info

    let tableParts = req.table.split('.', 2)
    tableParts.reverse()

    info = {
      created: false,
      geom: this.options.defaultGeom || 'geom',
      insert: false,
      ip: false,
      name: req.table,
      modified: false,
      pk: this.options.defaultPk || 'id',
      schema: tableParts[1] || 'public',
      select: false,
      srid: this.options.defaultSrid || null,
      table: tableParts[0],
      update: false
    }

    let colSql = "SELECT column_name, data_type " +
        "FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = $1 " +
        "AND table_schema = $2"

    let permSql = "SELECT privilege_type " +
        "FROM information_schema.role_table_grants " +
        "WHERE table_name = $1 AND table_schema = $2 AND grantee = $3"

    let [colRes, permRes] = await Promise.all([
      this.pool.query(colSql, [info.table, info.schema]),
      this.pool.query(permSql, [info.table, info.schema, this.options.user])
    ])

    // if (colRes.rows.length === 0) {
    //   // The user does not have access to the table.
    //   this.table_info_cache[req.table] = null
    //   return null
    // }

    colRes.rows.forEach((row) => {
      if (row.column_name === '_created' &&
          /timestamp/.test(row.data_type)) {
	      info.created = true
      } else if (row.column_name === '_modified' &&
                 /timestamp/.test(row.data_type)) {
	      info.modified = true
      } else if (row.column_name === '_ip' &&
                 /character varying/.test(row.data_type)) {
	      info.ip = true
      }
    })

    if (permRes.rows.length === 0) {
      // If no permissions are explicitly granted, we assume the user is the
      // table owner and has all permissions.
      info.insert = true
      info.select = true
      info.update = true
    } else {
      permRes.rows.forEach((row) => {
        if (row.privilege_type === 'INSERT') info.insert = true
        if (row.privilege_type === 'SELECT') info.select = true
        if (row.privilege_type === 'UPDATE') info.update = true
      })
    }

    this.table_info_cache[req.table] = info
    return info
  }

  rowToFeature(row, pk, geom) {
    let feature = {
      type: 'Feature',
      properties: {...row}
    }

    if (pk in row) {
      feature.id = row[pk]
      delete feature.properties[pk]
    }

    if (geom) {
      feature.geometry = JSON.parse(feature.properties[geom])
      delete feature.properties[geom]
    }

    return feature
  }

  getFeatureInfo(req) {
    let info = req.tableInfo
    let feature = req.body
    let insert = req.method === 'POST'

    let names = []
    let placeholders = []
    let values = []
    let i = 1
    let now = new Date()

    if (feature.properties) for (let name in feature.properties) {
      names.push(utils.sqlSanitize(name))
      placeholders.push('$' + i++)
      values.push(feature.properties[name])
    }

    if (info.geom) {
      let geom = 'ST_SetSRID(ST_GeomFromGeoJSON($' + i++ + '), 4326)'
      names.push(info.geom)
      placeholders.push(
        (info.srid) ? `ST_Transform(${geom}, ${info.srid})` : geom)
      values.push(JSON.stringify(feature.geometry))
    }

    if (info.ip && insert) {
      names.push('_ip')
      placeholders.push('$' + i++)
      values.push(req.headers['x-forwarded-for'] || req.connection.remoteAddress)
    }

    if (info.created && insert) {
      names.push('_created')
      placeholders.push('$' + i++)
      values.push(now)
    }

    if (info.modified) {
      names.push('_modified')
      placeholders.push('$' + i++)
      values.push(now)
    }

    return {names, placeholders, values}
  }

  async middleware(req, res, next) {
    req.tableInfo = await this.getTableInfo(req)
    if (req.tableInfo === null) return this.forbidden(res)

    if (req.body) req.featureInfo = this.getFeatureInfo(req)

    return next()
  }

  async getTable(req, res) {
    let info = req.tableInfo
    if (!info.select) return this.forbidden(res)
    let sql = `SELECT *, ST_AsGeoJSON(ST_Transform(${info.geom}, 4326)) ` +
        `AS ${info.geom} FROM {table}`
    return this.query(req, res, sql, undefined, true)
  }

  async postTable(req, res) {
    let {names, placeholders, values} = req.featureInfo
    if (!req.tableInfo.insert) return this.forbidden(res)
    let sql = `INSERT INTO ${req.table} (${names.toString()}) ` +
        `VALUES (${placeholders.toString()})`
    if (req.tableInfo.select) sql += `RETURNING ${req.tableInfo.pk}`
    return this.query(req, res, sql, values)
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

module.exports = PostgresUser
