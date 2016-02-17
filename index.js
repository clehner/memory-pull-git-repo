var pull = require('pull-stream')
var multicb = require('multicb')
var crypto = require('crypto')

module.exports = Repo

function gitHash(obj, data) {
  var hasher = crypto.createHash('sha1')
  hasher.update(obj.type + ' ' + obj.length + '\0')
  hasher.update(data)
  return hasher.digest('hex')
}

function Repo() {
  if (!(this instanceof Repo)) return new Repo()
  this._objects = {}
  this._refs = {}
}

Repo.prototype.refs = function (prefix) {
  var refs = this._refs
  var refNames = Object.keys(refs)
  var i = 0
  return function (abort, cb) {
    if (abort) return
    if (i >= refNames.length) return cb(true)
    var refName = refNames[i++]
    cb(null, {
      name: refName,
      hash: refs[refName]
    })
  }
}

Repo.prototype.hasObject = function (hash, cb) {
  cb(null, hash in this._objects)
}

Repo.prototype.getObject = function (hash, cb) {
  var obj = this._objects[hash]
  if (!obj) return cb(new Error('Object not present with key ' + hash))
  cb(null, {
    type: obj.type,
    length: obj.length,
    read: pull.once(obj.data)
  })
}

Repo.prototype.update = function (readRefUpdates, readObjects, cb) {
  var done = multicb({pluck: 1})
  var objects = {}

  if (readRefUpdates) {
    var doneReadingRefs = done()
    var refs = {}
    for (var name in this._refs)
      refs[name] = this._refs[name]
    readRefUpdates(null, function next(end, update) {
      if (end) return doneReadingRefs(end === true ? null : end)
      if (update.old != refs[update.name])
        return doneReadingRefs(new Error(
          'Ref update old value is incorrect. ' +
          'ref: ' + update.name + ', ' +
          'old in update: ' + update.old + ', ' +
          'old in repo: ' + refs[update.name]
        ))
      if (update.new)
        refs[update.name] = update.new
      else
        delete refs[update.name]
      readRefUpdates(null, next)
    })
  }

  if (readObjects) {
    var doneReadingObjects = done()
    readObjects(null, function next(end, object) {
      if (end) return doneReadingObjects(end === true ? null : end)
      pull(
        object.read,
        pull.collect(function (err, bufs) {
          if (err) return doneReadingObjects(err)
          var buf = Buffer.concat(bufs)
          var hash = gitHash(object, buf)
          objects[hash] = {
            type: object.type,
            length: object.length,
            data: buf
          }
          readObjects(null, next)
        })
      )
    })
  }

  var self = this
  done(function (err) {
    if (err) return cb(err)
    if (refs)
      self._refs = refs
    for (var hash in objects)
      self._objects[hash] = objects[hash]
    cb()
  })
}

