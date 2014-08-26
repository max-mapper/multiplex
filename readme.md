# multiplex

A binary stream multiplexer. Stream multiple streams of binary data over a single binary stream. Like [mux-demux](https://npmjs.org/package/mux-demux) but faster since it only works with binary streams.

[![NPM](https://nodei.co/npm/multiplex.png)](https://nodei.co/npm/multiplex/)

## api

### `var multiplex = require('multiplex')(opts, [onStream])`

Returns a new multiplexer. You can use this to create sub-streams. All data written to sub-streams will be emitted through this. If you pipe a multiplex instance to another multiplex instance all substream data will be multiplexed and demultiplexed on the other end.

`onStream` will be called with `(stream, id)` whenever a new remote sub-stream is created with an id that hasn't already been created with `.createStream`.

You can optionally set:

* `opts.error` - forward errors on individual streams
* `opts.maxDepth` - maximum number of messages to recursively parse on the same chunk (default: 100)

### `multiplex.createStream([id])`

Creates a new sub-stream with an optional whole string `id` (default is to use a autoincrementing integer). 

Sub-streams are duplex streams.

### `multiplex.destroyStream(id)`

Removes sub-stream, `id` is mandatory.

## events

### `multiplex.on('error', function (err) {})`

Emitted when the outer stream encounters invalid data

### `stream.on('error', function (err) {})`

Emitted when encoding of data fails (opts.error must be set to true)

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

### contributing

multiplex is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [CONTRIBUTING.md](contributing.md) file for more details.

### contributors

multiplex is only possible due to the excellent work of the following contributors:

<table><tbody>
<tr><th align="left">Max Ogden</th><td><a href="https://github.com/maxogden">GitHub/maxogden</a></td><td><a href="http://twitter.com/maxogden">Twitter/@maxogden</a></td></tr>
<tr><th align="left">Ayman Mackouly</th><td><a href="https://github.com/1N50MN14/">GitHub/1N50MN14</a></td><td></td></tr>
</tbody></table>
