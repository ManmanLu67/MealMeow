// 把微信云数据库收成 CloudDb：get、set、remove、query、runTransaction。
// node --test 不加载这个文件，也不请求微信。

function missing(err) {
  const code = err && (err.errCode || err.code)
  const msg = String((err && (err.errMsg || err.message)) || '')
  return code === -502005 || /not exist|does not exist|不存在|cannot find/i.test(msg)
}

function strip(data) {
  if (!data || typeof data !== 'object') return data
  const copy = Object.assign({}, data)
  delete copy._id
  return copy
}

function wxCloudDb(db) {
  const command = db.command

  function wrap(database) {
    return {
      async get(collection, id) {
        try {
          const res = await database.collection(collection).doc(id).get()
          if (!res || res.data == null) return null
          return strip(res.data)
        } catch (err) {
          if (missing(err)) return null
          throw err
        }
      },

      async set(collection, id, data) {
        await database.collection(collection).doc(id).set({ data: data })
      },

      async remove(collection, id) {
        try {
          await database.collection(collection).doc(id).remove()
        } catch (err) {
          if (missing(err)) return
          throw err
        }
      },

      async query(collection, q) {
        const where = q.where || {}
        const filter = {}
        const keys = Object.keys(where)
        for (let i = 0; i < keys.length; i += 1) {
          const key = keys[i]
          const expected = where[key]
          if (expected && typeof expected === 'object' && Object.prototype.hasOwnProperty.call(expected, 'lte')) {
            filter[key] = command.lte(expected.lte)
          } else {
            filter[key] = expected
          }
        }
        let cursor = database.collection(collection)
        if (keys.length > 0) cursor = cursor.where(filter)
        if (q.skip) cursor = cursor.skip(q.skip)
        if (q.limit) cursor = cursor.limit(q.limit)
        const res = await cursor.get()
        return (res.data || []).map(strip)
      },

      async runTransaction(fn) {
        const tx = await database.startTransaction()
        try {
          const result = await fn(wrap(tx))
          await tx.commit()
          return result
        } catch (err) {
          await tx.rollback()
          throw err
        }
      },
    }
  }

  return wrap(db)
}

module.exports = { wxCloudDb }
