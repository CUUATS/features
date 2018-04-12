function sqlSanitize(value) {
  return value.replace(/[^\w.]/g, '')
}

module.exports.sqlSanitize = sqlSanitize

