var multibuffer = require('multibuffer')
var through = require('through2')
var varint = require('varint')

module.exports = Multiplex

var dataVal = new Buffer('d')[0]
var errorVal = new Buffer('e')[0]

function Multiplex(opts, onStream) {
  if (!(this instanceof Multiplex)) return new Multiplex(opts, onStream)
  if (typeof opts === 'function') {
    onStream = opts
    opts = {}
  }
  if (!opts) {
    opts = {}
  }

  var self = this
  
  this.idx = 0
  this.streams = {}
  
  var reader = through(function(chunk, encoding, next) {
    decodeStream.write(chunk)
    next()
  })
  
  var writer = through(function(chunk, encoding, next) {
    reader.push(chunk)
    next()
  })

  var decodeStream = through(decode)
  
  function decode(chunk, encoding, next) {
    var type = chunk[0]
    chunk = chunk.slice(1)
    var vi = varint.decode(chunk)
    var rest = chunk.slice(varint.decode.bytesRead + 1)
    createOrPush(vi, rest, type)
    next()
  }
  
  function createOrPush(id, chunk, type) {
    if (Object.keys(self.streams).indexOf(id + '') === -1) {
      var created = createStream(id)
      created.meta = id
      if (onStream) onStream(created, id)
    }
    if (chunk.length === 0) return self.streams[id].end()
    if (type === dataVal) self.streams[id].push(chunk)
    if (type === errorVal) self.streams[id].emit('error', new Error(chunk.toString()))
  }
  
  function createStream(id) {
    if (typeof id !== 'undefined') self.idx = id + 1
    else id = self.idx++
    
    var encoder = self.streams[id] = through(onData, onEnd)
    var varid = varint.encode(id)
    
    if (opts.error) {
      encoder.on('error', function(e) {
        var mbuff = encode(new Buffer(e.message))
        mbuff[0] = errorVal
        writer.write(mbuff)
      })
    }
    
    function encode(chunk) {
      // the +1 at the end is reserved for data type flag (e.g. d, e)
      var mbuff = multibuffer.encode(chunk, varid.length + 1)
      for (var i = 1; i < varid.length + 1; i++) mbuff[i] = varid[i - 1]
      return mbuff
    }
    
    function onData(chunk, encoding, next) {
      var mbuff = encode(chunk)
      mbuff[0] = dataVal
      writer.write(mbuff)
      next()
    }
    
    function onEnd(done) {
      var bytes = [dataVal].concat(varid)
      var endBuff = new Buffer(bytes)
      writer.write(endBuff)
      done()
    }
    
    encoder.meta = id
    return encoder
  }
  
  reader.createStream = createStream
  return reader
}
