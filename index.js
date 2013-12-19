var multibuffer = require('multibuffer')
var mbs = require('multibuffer-stream')
var through = require('through2')
var varint = require('varint')
var combiner = require('stream-combiner')

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
  var decoder = combiner(decodeStream, mbs.unpackStream(), writer)
  
  function decode(chunk, encoding, next) {
    var vi = varint.decode(chunk)
    var rest = chunk.slice(varint.bytesRead)
    createOrPush(vi, rest)
    next()
  }
  
  function createOrPush(id, chunk) {
    if (Object.keys(self.streams).indexOf(id) === -1) {
      var created = createStream(id)
      if (onStream) onStream(created, id)
    }
    self.streams[id].push(chunk)
  }
  
  function createStream(id) {
    if (typeof id !== 'undefined') self.idx = id + 1
    else id = self.idx++
    
    var encoder = self.streams[id] = through(encode)
    var varid = varint.encode(id)
    
    function encode(chunk, encoding, next) {
      var mbuff = multibuffer.encode(chunk, varid.length)
      
      for (var i = 0; i < varid.length; i++) mbuff[i] = varid[i]
      
      writer.write(mbuff)
      next()
    }
    
    return encoder
  }
  
  reader.createStream = createStream
  return reader
}
