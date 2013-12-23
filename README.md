# tar-fs

filesystem bindings for [tar-stream](https://github.com/mafintosh/tar-stream).

	npm install tar-fs

[![build status](https://secure.travis-ci.org/mafintosh/tar-fs.png)](http://travis-ci.org/mafintosh/tar-fs)

## Usage

tar-fs allows you to pack directories into tarballs and extract tarballs into directories.

``` js
var tar = require('tar-fs');
var fs = require('fs');

// packing a directory
tar.pack('./my-directory').pipe(fs.createWriteStream('my-tarball.tar'));

// extracting a directory
fs.createReadStream('my-other-tarball.tar').pipe(tar.extract('./my-other-directory'));
```

To ignore various files when packing or extracting add a ignore function to the options

``` js
var pack = tar.pack('./my-directory', {
	ignore: function(name) {
		return path.extname(name) === '.bin'; // ignore .bin files when packing
	}
});

var extract = tar.extract('./my-other-directory', {
	ignore: function(name) {
		return path.extname(name) === '.bin'; // ignore .bin files inside the tarball when extracing
	}
});
```

## Copy a directory

Copying a directory with permissions and mtime intact is as simple as

``` js
tar.pack('source-directory').pipe(tar.extract('dest-directory'));
```

## Performance

Packing and extracting a 6.1 GB with 2496 directories and 2398 files yields the following results on my Macbook Air

* tar-fs: 34.261 ms
* [node-tar](https://github.com/isaacs/node-tar): 366.123 ms

## License

MIT
