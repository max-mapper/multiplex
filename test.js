var test = require('tape')
var concat = require('concat-stream')
var through = require('through2')
var multiplex = require('./')

test('one way piping work with 2 sub-streams', function(t) {
  var plex1 = multiplex()
  var stream1 = plex1.createStream()
  var stream2 = plex1.createStream()

  var plex2 = multiplex(function onStream(stream, id) {
    stream.pipe(collect())
  })

  plex1.pipe(plex2)

  stream1.write(new Buffer('hello'))
  stream2.write(new Buffer('world'))
  stream1.end()
  stream2.end()
  
  var pending = 2
  var results = []
  
  function collect() {
    return concat(function(data) {
      results.push(data.toString())
      if (--pending === 0) {
        results.sort()
        t.equal(results[0].toString(), 'hello')
        t.equal(results[1].toString(), 'world')
        t.end()
      }
    })
  }
})

test('two way piping works with 2 sub-streams', function(t) {
  var plex1 = multiplex()

  var plex2 = multiplex(function onStream(stream, id) {
    var uppercaser = through(function(chunk, e, done) {
      this.push(new Buffer(chunk.toString().toUpperCase()))
      this.end()
      done()
    })
    stream.pipe(uppercaser).pipe(stream)
  })

  plex1.pipe(plex2).pipe(plex1)
  
  var stream1 = plex1.createStream()
  var stream2 = plex1.createStream()

  stream1.pipe(collect())
  stream2.pipe(collect())
  
  stream1.write(new Buffer('hello'))
  stream2.write(new Buffer('world'))
  
  var pending = 2
  var results = []
  
  function collect() {
    return concat(function(data) {
      results.push(data.toString())
      if (--pending === 0) {
        results.sort()
        t.equal(results[0].toString(), 'HELLO')
        t.equal(results[1].toString(), 'WORLD')
        t.end()
      }
    })
  }
})
