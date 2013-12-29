var multibuffer = require('multibuffer')
var through = require('through2')
var varint = require('varint')

module.exports = Multiplex

function Multiplex(onStream) {
  if (!(this instanceof Multiplex)) return new Multiplex(onStream)
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
    var vi = varint.decode(chunk)
    var rest = chunk.slice(varint.decode.bytesRead)
    createOrPush(vi, rest)
    next()
  }
  
  function createOrPush(id, chunk) {
    if (Object.keys(self.streams).indexOf(id + '') === -1) {
      var created = createStream(id)
      created.meta = id
      if (onStream) onStream(created, id)
    }
    if (chunk.length === 0) return self.streams[id].end()
    var unpacked = multibuffer.unpack(chunk)
    self.streams[id].push(unpacked[0])
  }
  
  function createStream(id) {
    if (typeof id !== 'undefined') self.idx = id + 1
    else id = self.idx++
    
    var encoder = self.streams[id] = through(encode, onEnd)
    var varid = varint.encode(id)
    
    function encode(chunk, encoding, next) {
      var mbuff = multibuffer.encode(chunk, varid.length)
      
      for (var i = 0; i < varid.length; i++) mbuff[i] = varid[i]
      
      writer.write(mbuff)
      next()
    }
    
    function onEnd(done) {
      var endBuff = new Buffer(varid)
      writer.write(endBuff)
      done()
    }
    
    encoder.meta = id
    return encoder
  }
  
  reader.createStream = createStream
  return reader
}
