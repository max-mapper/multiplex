var stream = require('readable-stream')
var varint = require('varint')
var events = require('events')
var xtend = require('xtend')
var util = require('util')

var empty = new Buffer(0)
var pool = new Buffer(10 * 1024)
var used = 0

var Channel = function (name, plex, opts) {
  if (!opts) opts = {}
  stream.Duplex.call(this)

  this.name = name
  this.channel = 0
  this.initiator = false
  this.chunked = !!opts.chunked
  this.halfOpen = !!opts.halfOpen
  this.destroyed = false
  this.finalized = false

  this._multiplex = plex
  this._dataHeader = 0
  this._opened = false
  this._awaitDrain = 0

  var finished = false
  var ended = false

  this.once('end', function () {
    if (this.destroyed) return
    ended = true
    if (finished) this._finalize()
    else if (!this.halfOpen) this.end()
  })

  this.once('finish', function onfinish () {
    if (this.destroyed) return
    if (!this._opened) {
      this.once('open', onfinish)
    } else {
      this._multiplex._send(this.channel << 3 | (this.initiator ? 4 : 3), null)
      finished = true
      if (ended) this._finalize()
    }
  })
}

util.inherits(Channel, stream.Duplex)

Channel.prototype.destroy = function (err) {
  this._destroy(err, true)
}

Channel.prototype._destroy = function (err, local) {
  if (this.destroyed) return
  this.destroyed = true
  if (err && (!local || events.listenerCount(this, 'error'))) this.emit('error', err)
  this.emit('close')
  if (local && this._opened) this._multiplex._send(this.channel << 3 | (this.initiator ? 6 : 5), err ? new Buffer(err.message) : null)
  this._finalize()
}

Channel.prototype._finalize = function () {
  if (this.finalized) return
  this.finalized = true
  this.emit('finalize')
}

Channel.prototype._write = function (data, enc, cb) {
  if (!this._opened) {
    this.once('open', this._write.bind(this, data, enc, cb))
    return
  }
  if (this.destroyed) return cb()

  var drained = this._multiplex._send(this._dataHeader, data)
  if (drained) cb()
  else this._multiplex._ondrain.push(cb)
}

Channel.prototype._read = function () {
  if (this._awaitDrain) {
    var drained = this._awaitDrain
    this._awaitDrain = 0
    this._multiplex._onchanneldrain(drained)
  }
}

Channel.prototype.open = function (channel, initiator) {
  this.channel = channel
  this.initiator = initiator
  this._dataHeader = channel << 3 | (initiator ? 2 : 1)
  this._opened = true
  if (initiator) this._multiplex._send(channel << 3 | 0, this.name !== this.channel.toString() ? new Buffer(this.name) : null)
  this.emit('open')
}

var Multiplex = function (opts, onchannel) {
  if (!(this instanceof Multiplex)) return new Multiplex(opts, onchannel)
  stream.Duplex.call(this)

  if (typeof opts === 'function') {
    onchannel = opts
    opts = null
  }

  this.destroyed = false
  this._options = opts || {}
  this._local = []
  this._remote = []
  this._list = this._local
  this._receiving = {}
  this._onchannel = onchannel
  this._chunked = false
  this._state = 0
  this._type = 0
  this._channel = 0
  this._missing = 0
  this._message = null
  this._buf = new Buffer(100)
  this._ptr = 0
  this._awaitChannelDrains = 0
  this._onwritedrain = null
  this._ondrain = []

  this.on('finish', this._clear)
}

util.inherits(Multiplex, stream.Duplex)

Multiplex.prototype.createStream = function (name, opts) {
  if (this.destroyed) throw new Error('Multiplexer is destroyed')
  var id = this._local.indexOf(null)
  if (id === -1) id = this._local.push(null) - 1
  var channel = new Channel(name || id.toString(), this, xtend(this._options, opts))
  return this._addChannel(channel, id, this._local)
}

Multiplex.prototype.receiveStream = function (name, opts) {
  if (this.destroyed) throw new Error('Multiplexer is destroyed')
  if (name === undefined || name === null) throw new Error('Name is needed when receiving a stream')
  if (this._receiving[name]) throw new Error('You are already receiving this stream')
  var channel = new Channel(name.toString(), this, xtend(this._options, opts))
  this._receiving[name] = channel
  return channel
}

Multiplex.prototype._send = function (header, data) {
  var len = data ? data.length : 0
  var oldUsed = used
  var drained = true

  varint.encode(header, pool, used)
  used += varint.encode.bytes
  varint.encode(len, pool, used)
  used += varint.encode.bytes

  drained = this.push(pool.slice(oldUsed, used))

  if (pool.length - used < 100) {
    pool = new Buffer(10 * 1024)
    used = 0
  }

  if (data) drained = this.push(data)
  return drained
}

Multiplex.prototype._addChannel = function (channel, id, list) {
  channel.open(id, list === this._local)

  while (list.length <= id) list.push(null)
  list[id] = channel
  channel.on('finalize', function () {
    list[id] = null
  })

  return channel
}

Multiplex.prototype._writeVarint = function (data, offset) {
  for (offset; offset < data.length; offset++) {
    this._buf[this._ptr++] = data[offset]
    if (!(data[offset] & 0x80)) {
      if (this._state === 0) {
        var header = varint.decode(this._buf)
        this._type = header & 7
        this._channel = header >> 3
        this._list = this._type & 1 ? this._local : this._remote
        var chunked = this._list.length > this._channel && this._list[this._channel] && this._list[this._channel].chunked
        this._chunked = !!(this._type === 1 || this._type === 2) && chunked
      } else {
        this._missing = varint.decode(this._buf)
      }
      this._state++
      this._ptr = 0
      return offset + 1
    }
  }
  return data.length
}

Multiplex.prototype._writeMessage = function (data, offset) {
  var free = data.length - offset
  var missing = this._missing

  if (!this._message) {
    if (missing <= free) { // fast track - no copy
      this._missing = 0
      this._push(data.slice(offset, offset + missing))
      return offset + missing
    }
    if (this._chunked) {
      this._missing -= free
      this._push(data.slice(offset, data.length))
      return data.length
    }
    this._message = new Buffer(missing)
  }

  data.copy(this._message, this._ptr, offset, offset + missing)

  if (missing <= free) {
    this._missing = 0
    this._push(this._message)
    return offset + missing
  }

  this._missing -= free
  this._ptr += free

  return data.length
}

Multiplex.prototype._push = function (data) {
  if (!this._missing) {
    this._ptr = 0
    this._state = 0
    this._message = null
  }

  if (this._type === 0) { // open
    if (this.destroyed) return

    var name = data.toString() || this._channel.toString()
    var channel

    if (this._receiving[name]) {
      channel = this._receiving[name]
      delete this._receiving[name]
      this._addChannel(channel, this._channel, this._list)
    } else if (this._onchannel) {
      channel = new Channel(name, this, this._options)
      this._onchannel(this._addChannel(channel, this._channel, this._list), channel.name)
    }
    return
  }

  var stream = this._list[this._channel]
  if (!stream) return

  switch (this._type) {
    case 5: // local error
    case 6: // remote error
    stream._destroy(new Error(data.toString() || 'Channel destroyed'), false)
    return

    case 3: // local end
    case 4: // remote end
    stream.push(null)
    return

    case 1: // local packet
    case 2: // remote packet
    if (!stream.push(data)) {
      this._awaitChannelDrains++
      stream._awaitDrain++
    }
    return
  }
}

Multiplex.prototype._onchanneldrain = function (drained) {
  this._awaitChannelDrains -= drained
  if (this._awaitChannelDrains) return
  var ondrain = this._onwritedrain
  this._onwritedrain = null
  if (ondrain) ondrain()
}

Multiplex.prototype._write = function (data, enc, cb) {
  var offset = 0

  while (offset < data.length) {
    if (this._state === 2) offset = this._writeMessage(data, offset)
    else offset = this._writeVarint(data, offset)
  }
  if (this._state === 2 && !this._missing) this._push(empty)

  if (this._awaitChannelDrains) this._onwritedrain = cb
  else cb()
}

Multiplex.prototype._read = function () {
  while (this._ondrain.length) this._ondrain.shift()()
}

Multiplex.prototype._clear = function () {
  var list = this._local.concat(this._remote)

  this._local = []
  this._remote = []

  list.forEach(function (stream) {
    if (stream) stream._destroy(null, false)
  })

  this.push(null)
}

Multiplex.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true
  this._clear()
  if (err) this.emit('error', err)
  this.emit('close')
}

module.exports = Multiplex
