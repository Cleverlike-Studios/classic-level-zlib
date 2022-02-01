'use strict'

const { AbstractIterator } = require('abstract-level')
const binding = require('./binding')

const kContext = Symbol('context')
const kCache = Symbol('cache')
const kFinished = Symbol('finished')
const kPosition = Symbol('position')
const kHandleNext = Symbol('handleNext')
const kHandleNextv = Symbol('handleNextv')
const kCallback = Symbol('callback')
const empty = []

class Iterator extends AbstractIterator {
  constructor (db, context, options) {
    super(db, options)

    this[kContext] = binding.iterator_init(context, options)
    this[kHandleNext] = this[kHandleNext].bind(this)
    this[kHandleNextv] = this[kHandleNextv].bind(this)
    this[kCallback] = null
    this[kCache] = empty
    this[kFinished] = false
    this[kPosition] = 0
  }

  _seek (target, options) {
    this[kCache] = empty
    this[kFinished] = false
    this[kPosition] = 0

    binding.iterator_seek(this[kContext], target)
  }

  _next (callback) {
    if (this[kPosition] < this[kCache].length) {
      const entry = this[kCache][this[kPosition]++]
      process.nextTick(callback, null, entry[0], entry[1])
    } else if (this[kFinished]) {
      process.nextTick(callback)
    } else {
      this[kCallback] = callback

      // Limit the size of the cache to prevent starving the event loop
      // while we're recursively calling process.nextTick().
      binding.iterator_nextv(this[kContext], 1000, this[kHandleNext])
    }
  }

  [kHandleNext] (err, items, finished) {
    const callback = this[kCallback]
    if (err) return callback(err)

    this[kCache] = items
    this[kFinished] = finished
    this[kPosition] = 0

    this._next(callback)
  }

  _nextv (size, options, callback) {
    if (this[kFinished]) {
      process.nextTick(callback, null, [])
    } else {
      this[kCallback] = callback
      binding.iterator_nextv(this[kContext], size, this[kHandleNextv])
    }
  }

  [kHandleNextv] (err, items, finished) {
    const callback = this[kCallback]
    if (err) return callback(err)
    this[kFinished] = finished
    callback(null, items)
  }

  _close (callback) {
    this[kCache] = empty
    this[kCallback] = null

    binding.iterator_close(this[kContext], callback)
  }

  // Undocumented, exposed for tests only
  get cached () {
    return this[kCache].length - this[kPosition]
  }
}

exports.Iterator = Iterator
