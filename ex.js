var multiplex = require('multiplex')

var plex = multiplex()
var plex1 = multiplex()

var a = plex.createSharedStream('test')
var b = plex1.createSharedStream('test')

a.write('hello')
a.on('data', console.log)

b.on('data', console.log)
b.write('world')

plex.pipe(plex1).pipe(plex)
