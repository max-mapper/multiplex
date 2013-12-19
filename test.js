var multiplex = require('./')
var plex1 = multiplex()
var stream1 = plex1.createStream()
var stream2 = plex1.createStream()

var plex2 = multiplex(function onStream(stream, id) {
  stream.on('data', function(c) {
    console.log('data', id, c.toString())
  })
})

plex1.pipe(plex2)

stream1.write(new Buffer('yo'))
stream2.write(new Buffer('yoooooo'))
