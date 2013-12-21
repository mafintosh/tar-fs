# tar-fs

filesystem bindings for [tar-stream](https://github.com/mafintosh/tar-stream).

	npm install tar-fs

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

## License

MIT