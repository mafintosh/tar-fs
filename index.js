var tar = require('tar-stream');
var pump = require('pump');
var mkdirp = require('mkdirp');
var fs = require('fs');
var path = require('path');
var os = require('os');

var win32 = os.platform() === 'win32';

var noop = function() {};

var echo = function(name) {
	return name;
};

var normalize = !win32 ? echo : function() {
	return name.replace(/\\/g, '/');
};

var statAll = function(cwd, ignore) {
	var queue = ['.'];

	return function loop(callback) {
		if (!queue.length) return callback();
		var next = queue.shift();
		var nextAbs = path.join(cwd, next);

		fs.lstat(nextAbs, function(err, stat) {
			if (err) return callback(err);

			if (!stat.isDirectory()) return callback(null, next, stat);

			fs.readdir(nextAbs, function(err, files) {
				if (err) return callback(err);

				for (var i = 0; i < files.length; i++) {
					if (!ignore(path.join(cwd, next, files[i]))) queue.push(path.join(next, files[i]));
				}

				callback(null, next, stat);
			});
		});
	};
};

exports.pack = function(cwd, opts) {
	if (!cwd) cwd = '.';
	if (!opts) opts = {};

	var ignore = opts.ignore || noop;
	var statNext = statAll(cwd, ignore);
	var pack = tar.pack();

	var onlink = function(filename, header) {
		fs.readlink(path.join(cwd, filename), function(err, linkname) {
			if (err) return pack.destroy(err);
			header.linkname = normalize(linkname);
			pack.entry(header, onnextentry);
		});
	};

	var onstat = function(err, filename, stat) {
		if (err) return pack.destroy(err);
		if (!filename) return pack.finalize();

		var header = {
			name: normalize(filename),
			mode: stat.mode,
			mtime: stat.mtime,
			size: stat.size,
			type: 'file',
			uid: stat.uid,
			gid: stat.gid
		};

		if (stat.isDirectory()) {
			header.size = 0;
			header.type = 'directory';
			return pack.entry(header, onnextentry);
		}

		if (stat.isSymbolicLink()) {
			header.size = 0;
			header.type = 'symlink';
			return onlink(filename, header);
		}

		// TODO: add fifo etc...

		if (!stat.isFile()) return pack.destroy(new Error('unsupported type for '+filename));

		var entry = pack.entry(header, onnextentry);
		var rs = fs.createReadStream(path.join(cwd, filename));

		pump(rs, entry);
	};

	var onnextentry = function(err) {
		if (err) return pack.destroy(err);
		statNext(onstat);
	};

	onnextentry();

	return pack;
};

exports.extract = function(cwd, opts) {
	if (!cwd) cwd = '.';
	if (!opts) opts = {};

	var ignore = opts.ignore || noop;
	var extract = tar.extract();

	extract.on('entry', function(header, stream, next) {
		var name = path.join(cwd, path.join('/', header.name));

		if (ignore(name)) {
			stream.resume();
			stream.on('end', next);
			return;
		}

		var onstat = function(err) {
			if (err) return next(err);
			fs.utimes(name, new Date(), header.mtime, function(err) {
				if (err) return next(err);
				fs.chmod(name, header.mode, next);
			});
		};

		var onlink = function() {
			fs.symlink(header.linkname, name, next); // how do you set mtime on a link?
		};

		var onfile = function() {
			var ws = fs.createWriteStream(name);

			pump(stream, ws, function(err) {
				if (err) return next(err);
				ws.on('close', onstat);
			});
		};

		if (header.type === 'directory') return mkdirp(name, onstat);

		mkdirp(path.dirname(name), function(err) {
			if (err) return next(err);
			if (header.type === 'symlink') return fs.unlink(name, onlink);
			if (header.type !== 'file') return next(new Error('unsupported type for '+name+' ('+header.type+')'));
			onfile();
		});
	});

	return extract;
};