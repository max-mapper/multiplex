var protobuf = require('protocol-buffers')
var duplexify = require('duplexify')
var lpstream = require('length-prefixed-stream')
var through = require('through2')
var fs = require('fs')

var messages = protobuf(fs.readFileSync(__dirname+'/schema.proto'))
var TYPE = messages.TYPE

var multiplex = function(opts, onstream) {
  if (typeof opts === 'function') return multiplex(null, opts)
  if (!opts) opts = {}

  var local = []
  var remote = []
  var encode = lpstream.encode()
  var decode = lpstream.decode()
  var dup = duplexify.obj(decode, encode)

  var addChannel = function(list, index, name) {
    var stream = duplexify.obj()
    var channel = list === remote ? -(index+1) : index+1

    var readable = through.obj()
    var writable = through.obj(function(data, enc, cb) {
      if (typeof data === 'string') data = new Buffer(data)
      encode.write(messages.Frame.encode({channel:channel, data:data, name:name}), cb)
      name = null
    })

    var destroy = function(type, data) {
      if (list[index] !== readable) return
      encode.write(messages.Frame.encode({channel:channel, type:type, data:data, name:name}))
      list[index] = null
    }

    list[index] = readable

    stream.meta = name
    stream.setReadable(readable)
    stream.setWritable(writable)

    var onerror = function(err) {
      destroy(TYPE.ERROR, err && new Buffer(err.message))
    }

    readable.once('destroy', function(err) {
      stream.removeListener('close', onerror)
      stream.removeListener('error', onerror)
      stream.destroy(err)
    })

    stream.on('close', onerror)
    if (opts.error) stream.on('error', onerror)

    writable.on('finish', function() {
      destroy(TYPE.END)
      readable.end()
    })

    return stream
  }

  var decodeFrame = function(data) {
    try {
      return messages.Frame.decode(data)
    } catch (err) {
      return null
    }
  }

  var decoder = function(data, enc, cb) {
    var frame = decodeFrame(data)
    if (!frame) return dup.destroy(new Error('Invalid data'))

    var channel = frame.channel
    var reply = channel < 0
    var index = reply ? -channel-1 : channel-1

    if (!reply && !remote[index] && onstream) {
      onstream(addChannel(remote, index, frame.name), frame.name || index)
    }

    var list = reply ? local : remote
    var stream = list[index]

    if (!stream) return cb()

    switch (frame.type) {
      case TYPE.DATA:
      return stream.write(frame.data, cb)

      case TYPE.END:
      list[index] = null
      stream.end()
      return cb()

      case TYPE.ERROR:
      list[index] = null
      stream.emit('destroy', frame.data && new Error(frame.data.toString()))
      return cb()
    }

    cb()
  }

  decode.pipe(through.obj(decoder))

  dup.on('close', function() {
    local.concat(remote).forEach(function(readable) {
      if (readable) readable.emit('destroy')
    })
  })

  dup.on('finish', function() {
    local.concat(remote).forEach(function(readable) {
      if (readable) readable.end()
    })
    encode.end()
  })

  dup.createStream = function(name) {
    var index = local.indexOf(null)
    if (index === -1) index = local.push(null)-1
    return addChannel(local, index, name && ''+name)
  }

  return dup
}

module.exports = multiplex