var multibuffer = require('multibuffer')
var through = require('through2')
var varint = require('varint')

module.exports = Multiplex

var dataVal = new Buffer('d')[0]
var errorVal = new Buffer('e')[0]
var empty = new Buffer(0)

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
    var parts = multibuffer.readPartial(chunk)
    var id = parts[0]
    parts = multibuffer.readPartial(parts[1])
    var data = parts[0]
    if (!data) data = empty
    createOrPush(id, data, type)
    next()
  }
  
  function createOrPush(id, chunk, type) {        
    if (null === id) return reader.emit('error', new Error('Invalid data'))
    if (Object.keys(self.streams).indexOf(id + '') === -1) {
      var created = createStream(id)
      created.meta = id.toString()
      onStream && onStream(created, created.meta)
    }
    if (chunk.length === 0) return self.streams[id].end()
    dataVal === type && self.streams[id].push(chunk)
    errorVal === type && self.streams[id].emit('error', new Error(chunk.toString()))
  }
  
  function createStream(id) {
    if (typeof id === 'undefined') id = ++self.idx
    id = '' + id
    var encoder = self.streams[id] = through(onData, onEnd)
    var varid = varint.encode(id.length)
    
    if (opts.error) {
      encoder.on('error', function(e) {        
        var mbuff = encode(new Buffer(e.message))
        mbuff[0] = errorVal
        writer.write(mbuff)
      })
    }
    
    function encode(chunk) {
      // the ', 1' reserves 1 byte at beginning of buffer for data type flag (e.g. d, e)
      var metabuff = multibuffer.encode(new Buffer(id), 1)
      var databuff = multibuffer.encode(chunk)
      return Buffer.concat([metabuff, databuff])
    }
    
    function onData(chunk, encoding, next) {
      var mbuff = encode(chunk)
      mbuff[0] = dataVal
      writer.write(mbuff)
      next()
    }
    
    function onEnd(done) {
      writer.write(encode(empty))
      done()
    }
    
    encoder.meta = id.toString()
    return encoder
  }

  function destroyStream(id) {
    delete self.streams[id]
  }
  
  reader.createStream = createStream
  reader.destroyStream = destroyStream
  return reader
}