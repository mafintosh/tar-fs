var test = require('tap').test;
var rimraf = require('rimraf');
var tar = require('../index');
var path = require('path');
var fs = require('fs');

test('copy a -> b', function(t) {
	t.plan(5);

	var a = path.join(__dirname, 'fixtures', 'a');
	var b = path.join(__dirname, 'fixtures', 'copy', 'a');

	rimraf.sync(b);
	tar.pack(a)
		.pipe(tar.extract(b))
		.on('finish', function() {
			var files = fs.readdirSync(b);
			t.same(files.length, 1);
			t.same(files[0], 'hello.txt');
			var fileB = path.join(b, files[0]);
			var fileA = path.join(a, files[0]);
			t.same(fs.readFileSync(fileB, 'utf-8'), fs.readFileSync(fileA, 'utf-8'));
			t.same(fs.statSync(fileB).mode, fs.statSync(fileA).mode);
			t.same(fs.statSync(fileB).mtime.getTime(), fs.statSync(fileA).mtime.getTime());
		});
});