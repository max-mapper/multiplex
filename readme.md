# multiplex

A binary stream multiplexer. Stream multiple streams of binary data over a single binary stream. Like [mux-demux](https://npmjs.org/package/mux-demux) but faster since it only works with binary streams.

[![NPM](https://nodei.co/npm/multiplex.png)](https://nodei.co/npm/multiplex/)

## api

### `var multiplex = require('multiplex')([onStream])`

Returns a new multiplexer. You can use this to create sub-streams. All data written to sub-streams will be emitted through this. If you pipe a multiplex instance to another multiplex instance all substream data will be multiplexed and demultiplexed on the other end.

`onStream` will be called with `(stream, id)` whenever a new remote sub-stream is created with an id that hasn't already been created with `.createStream`.

### `multiplex.createStream([id])`

Creates a new sub-stream with an optional whole integer `id` (default is to use a autoincrementing integer). 

Sub-streams are duplex streams.

### example

```js
var multiplex = require('multiplex')
var plex1 = multiplex()
var stream1 = plex1.createStream()
var stream2 = plex1.createStream()

var plex2 = multiplex(function onStream(stream, id) {
  stream.on('data', function(c) {
    console.log('data', id, c.toString())
  })
})

plex1.pipe(plex2)

stream1.write(new Buffer('stream one!'))
stream2.write(new Buffer('stream two!'))
```
