const test = require('brittle')
const rimraf = require('rimraf')
const tar = require('../index')
const tarStream = require('tar-stream')
const path = require('path')
const fs = require('fs')
const os = require('os')

const win32 = os.platform() === 'win32'

const mtime = function (st) {
  return Math.floor(st.mtime.getTime() / 1000)
}

test('copy a -> copy/a', function (t) {
  t.plan(5)

  const a = path.join(__dirname, 'fixtures', 'a')
  const b = path.join(__dirname, 'fixtures', 'copy', 'a')

  rimraf.sync(b)
  tar.pack(a)
    .pipe(tar.extract(b))
    .on('finish', function () {
      const files = fs.readdirSync(b)
      t.is(files.length, 1)
      t.is(files[0], 'hello.txt')
      const fileB = path.join(b, files[0])
      const fileA = path.join(a, files[0])
      t.alike(fs.readFileSync(fileB, 'utf-8'), fs.readFileSync(fileA, 'utf-8'))
      t.alike(fs.statSync(fileB).mode, fs.statSync(fileA).mode)
      t.alike(mtime(fs.statSync(fileB)), mtime(fs.statSync(fileA)))
    })
})

test('copy b -> copy/b', function (t) {
  t.plan(8)

  const a = path.join(__dirname, 'fixtures', 'b')
  const b = path.join(__dirname, 'fixtures', 'copy', 'b')

  rimraf.sync(b)
  tar.pack(a)
    .pipe(tar.extract(b))
    .on('finish', function () {
      const files = fs.readdirSync(b)
      t.is(files.length, 1)
      t.is(files[0], 'a')
      const dirB = path.join(b, files[0])
      const dirA = path.join(a, files[0])
      t.alike(fs.statSync(dirB).mode, fs.statSync(dirA).mode)
      t.alike(mtime(fs.statSync(dirB)), mtime(fs.statSync(dirA)))
      t.ok(fs.statSync(dirB).isDirectory())
      const fileB = path.join(dirB, 'test.txt')
      const fileA = path.join(dirA, 'test.txt')
      t.alike(fs.readFileSync(fileB, 'utf-8'), fs.readFileSync(fileA, 'utf-8'))
      t.alike(fs.statSync(fileB).mode, fs.statSync(fileA).mode)
      t.alike(mtime(fs.statSync(fileB)), mtime(fs.statSync(fileA)))
    })
})

test('symlink', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(5)

  const a = path.join(__dirname, 'fixtures', 'c')

  rimraf.sync(path.join(a, 'link'))
  fs.symlinkSync('.gitignore', path.join(a, 'link'))

  const b = path.join(__dirname, 'fixtures', 'copy', 'c')

  rimraf.sync(b)
  tar.pack(a)
    .pipe(tar.extract(b))
    .on('finish', function () {
      const files = fs.readdirSync(b).sort()
      t.is(files.length, 2)
      t.is(files[0], '.gitignore')
      t.is(files[1], 'link')

      const linkA = path.join(a, 'link')
      const linkB = path.join(b, 'link')

      t.alike(mtime(fs.lstatSync(linkB)), mtime(fs.lstatSync(linkA)))
      t.alike(fs.readlinkSync(linkB), fs.readlinkSync(linkA))
    })
})

test('follow symlinks', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(5)

  const a = path.join(__dirname, 'fixtures', 'c')

  rimraf.sync(path.join(a, 'link'))
  fs.symlinkSync('.gitignore', path.join(a, 'link'))

  const b = path.join(__dirname, 'fixtures', 'copy', 'c-dereference')

  rimraf.sync(b)
  tar.pack(a, { dereference: true })
    .pipe(tar.extract(b))
    .on('finish', function () {
      const files = fs.readdirSync(b).sort()
      t.is(files.length, 2)
      t.is(files[0], '.gitignore')
      t.is(files[1], 'link')

      const file1 = path.join(b, '.gitignore')
      const file2 = path.join(b, 'link')

      t.alike(mtime(fs.lstatSync(file1)), mtime(fs.lstatSync(file2)))
      t.alike(fs.readFileSync(file1), fs.readFileSync(file2))
    })
})

for (const afterClose of [false, true]) {
  test('ignore readlink results after pack destruction' + (afterClose ? ' completes' : ' starts'), async function (t) {
    let onreadlink
    const pendingReadlink = new Promise(function (resolve) { onreadlink = resolve })
    const xfs = Object.assign({}, fs, {
      lstat: function (filename, callback) {
        fs.lstat(path.join(__dirname, 'fixtures', 'a', 'hello.txt'), function (err, stat) {
          if (err) return callback(err)
          stat.isSymbolicLink = function () { return true }
          callback(null, stat)
        })
      },
      readlink: function (filename, callback) {
        onreadlink(callback)
      }
    })

    const pack = tar.pack(__dirname, { fs: xfs, entries: ['link'] })
    const callback = await pendingReadlink
    const closed = new Promise(function (resolve) { pack.once('close', resolve) })

    pack.destroy()
    if (afterClose) await closed

    t.execution(function () { callback(null, 'target') }, 'pending readlink does not throw after cancellation')
    await closed
  })
}

test('strip', function (t) {
  t.plan(2)

  const a = path.join(__dirname, 'fixtures', 'b')
  const b = path.join(__dirname, 'fixtures', 'copy', 'b-strip')

  rimraf.sync(b)

  tar.pack(a)
    .pipe(tar.extract(b, { strip: 1 }))
    .on('finish', function () {
      const files = fs.readdirSync(b).sort()
      t.is(files.length, 1)
      t.is(files[0], 'test.txt')
    })
})

test('strip + map', function (t) {
  t.plan(2)

  const a = path.join(__dirname, 'fixtures', 'b')
  const b = path.join(__dirname, 'fixtures', 'copy', 'b-strip')

  rimraf.sync(b)

  const uppercase = function (header) {
    header.name = header.name.toUpperCase()
    return header
  }

  tar.pack(a)
    .pipe(tar.extract(b, { strip: 1, map: uppercase }))
    .on('finish', function () {
      const files = fs.readdirSync(b).sort()
      t.is(files.length, 1)
      t.is(files[0], 'TEST.TXT')
    })
})

test('map + dir + permissions', function (t) {
  t.plan(win32 ? 1 : 2) // skip chmod test, it's not working like unix

  const a = path.join(__dirname, 'fixtures', 'b')
  const b = path.join(__dirname, 'fixtures', 'copy', 'a-perms')

  rimraf.sync(b)

  const aWithMode = function (header) {
    if (header.name === 'a') {
      header.mode = parseInt(700, 8)
    }
    return header
  }

  tar.pack(a)
    .pipe(tar.extract(b, { map: aWithMode }))
    .on('finish', function () {
      const files = fs.readdirSync(b).sort()
      const stat = fs.statSync(path.join(b, 'a'))
      t.is(files.length, 1)
      if (!win32) {
        t.is(stat.mode & parseInt(777, 8), parseInt(700, 8))
      }
    })
})

test('specific entries', function (t) {
  t.plan(6)

  const a = path.join(__dirname, 'fixtures', 'd')
  const b = path.join(__dirname, 'fixtures', 'copy', 'd-entries')

  const entries = ['file1', 'sub-files/file3', 'sub-dir']

  rimraf.sync(b)
  tar.pack(a, { entries })
    .pipe(tar.extract(b))
    .on('finish', function () {
      const files = fs.readdirSync(b)
      t.is(files.length, 3)
      t.not(files.indexOf('file1'), -1)
      t.not(files.indexOf('sub-files'), -1)
      t.not(files.indexOf('sub-dir'), -1)
      const subFiles = fs.readdirSync(path.join(b, 'sub-files'))
      t.alike(subFiles, ['file3'])
      const subDir = fs.readdirSync(path.join(b, 'sub-dir'))
      t.alike(subDir, ['file5'])
    })
})

test('check type while mapping header on packing', function (t) {
  t.plan(3)

  const e = path.join(__dirname, 'fixtures', 'e')

  const checkHeaderType = function (header) {
    if (header.name.indexOf('.') === -1) t.is(header.type, header.name)
  }

  tar.pack(e, { map: checkHeaderType })
})

test('finish callbacks', function (t) {
  t.plan(3)

  const a = path.join(__dirname, 'fixtures', 'a')
  const b = path.join(__dirname, 'fixtures', 'copy', 'a')

  rimraf.sync(b)

  let packEntries = 0
  let extractEntries = 0

  const countPackEntry = function (header) { packEntries++ }
  const countExtractEntry = function (header) { extractEntries++ }

  const onPackFinish = function (passedPack) {
    t.is(packEntries, 2, 'All entries have been packed') // 2 entries - the file and base directory
    t.is(passedPack, pack, 'The finish hook passes the pack')
  }

  const onExtractFinish = function () { t.is(extractEntries, 2) }

  const pack = tar.pack(a, { map: countPackEntry, finish: onPackFinish })

  pack.pipe(tar.extract(b, { map: countExtractEntry, finish: onExtractFinish }))
    .on('finish', function () {
      t.end()
    })
})

test('not finalizing the pack', function (t) {
  t.plan(2)

  const a = path.join(__dirname, 'fixtures', 'a')
  const b = path.join(__dirname, 'fixtures', 'b')

  const out = path.join(__dirname, 'fixtures', 'copy', 'merged-packs')

  rimraf.sync(out)

  const prefixer = function (prefix) {
    return function (header) {
      header.name = path.join(prefix, header.name)
      return header
    }
  }

  tar.pack(a, {
    map: prefixer('a-files'),
    finalize: false,
    finish: packB
  })

  function packB (pack) {
    tar.pack(b, { pack, map: prefixer('b-files') })
      .pipe(tar.extract(out))
      .on('finish', assertResults)
  }

  function assertResults () {
    const containers = fs.readdirSync(out)
    t.alike(containers, ['a-files', 'b-files'])
    const aFiles = fs.readdirSync(path.join(out, 'a-files'))
    t.alike(aFiles, ['hello.txt'])
  }
})

test('do not extract invalid tar', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(2)

  const a = path.join(__dirname, 'fixtures', 'invalid.tar')

  const out = path.join(__dirname, 'fixtures', 'invalid')

  rimraf.sync(out)

  fs.createReadStream(a)
    .pipe(tar.extract(out))
    .on('error', function (err) {
      t.ok(/is not a valid symlink/i.test(err.message))
      fs.stat(path.join(out, '../bar'), function (err) {
        t.ok(err)
      })
    })
    .on('finish', function () {
      t.fail('should not finish')
    })
})

test('extract tar intended for use by chroot', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(1)

  const a = path.join(__dirname, 'fixtures', 'valid.tar')

  const out = path.join(__dirname, 'fixtures', 'valid')

  rimraf.sync(out)

  fs.createReadStream(a)
    .pipe(tar.extract(out, { validateSymlinks: false }))
    .on('error', function (err) {
      t.ok(/is not a valid symlink/i.test(err.message))
      fs.stat(path.join(out, '../bar'), function (err) {
        t.ok(err)
      })
    })
    .on('finish', function () {
      t.ok(true)
    })
})

test('no abs hardlink targets', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(3)

  const out = path.join(__dirname, 'fixtures', 'invalid')
  const outside = path.join(__dirname, 'fixtures', 'outside')

  rimraf.sync(out)

  const s = tarStream.pack()

  fs.writeFileSync(outside, 'something')

  s.entry({
    type: 'link',
    name: 'link',
    linkname: outside
  })

  s.entry({
    name: 'link'
  }, 'overwrite')

  s.finalize()

  s.pipe(tar.extract(out))
    .on('error', function (err) {
      t.ok(err, 'had error')
      fs.readFile(outside, 'utf-8', function (err, str) {
        t.absent(err, 'no error')
        t.is(str, 'something')
      })
    })
})

test('do not write through a pre-existing symlink', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(2)

  const out = path.join(__dirname, 'fixtures', 'symlink-target')
  const outside = path.join(__dirname, 'fixtures', 'symlink-target-outside')

  rimraf.sync(out)
  rimraf.sync(outside)
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(outside, 'something')
  fs.symlinkSync(outside, path.join(out, 'config'))

  const s = tarStream.pack()
  s.entry({ name: 'config', type: 'file' }, 'overwrite')
  s.finalize()

  s.pipe(tar.extract(out))
    .on('finish', function () {
      t.is(fs.readFileSync(outside, 'utf-8'), 'something', 'outside file untouched')
      t.is(fs.readFileSync(path.join(out, 'config'), 'utf-8'), 'overwrite', 'written inside cwd')
    })
})

test('do not chmod the extraction root', function (t) {
  if (win32) {
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(1)

  const out = path.join(__dirname, 'fixtures', 'chmod-root')

  rimraf.sync(out)
  fs.mkdirSync(out, { recursive: true })
  fs.chmodSync(out, 0o755)

  const s = tarStream.pack()
  s.entry({ name: '.', type: 'directory', mode: 0o0100 })
  s.finalize()

  s.pipe(tar.extract(out))
    .on('finish', function () {
      t.is(fs.statSync(out).mode & 0o777, 0o755, 'root permissions unchanged')
    })
})

test('strip setuid/setgid/sticky bits', function (t) {
  if (win32) {
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(1)

  const out = path.join(__dirname, 'fixtures', 'suid')

  rimraf.sync(out)

  const s = tarStream.pack()
  s.entry({ name: 'suid', type: 'file', mode: 0o4755 }, 'data')
  s.finalize()

  s.pipe(tar.extract(out))
    .on('finish', function () {
      t.is(fs.statSync(path.join(out, 'suid')).mode & 0o7000, 0, 'special bits stripped')
    })
})

test('do not pack entries outside cwd', function (t) {
  t.plan(1)

  const a = path.join(__dirname, 'fixtures', 'a')

  tar.pack(a, { entries: ['../b'] })
    .on('error', function (err) {
      t.ok(/is not a valid path/i.test(err.message))
    })
    .on('end', function () {
      t.fail('should not pack outside cwd')
    })
    .resume()
})

test('strip does not allow symlinks to escape', function (t) {
  if (win32) {
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(2)

  const out = path.join(__dirname, 'fixtures', 'strip-symlink')
  const outside = path.join(__dirname, 'fixtures', 'strip-symlink-outside')

  rimraf.sync(out)
  rimraf.sync(outside)
  fs.writeFileSync(outside, 'something')

  const s = tarStream.pack()
  s.entry({ name: 'prefix/link', type: 'symlink', linkname: '../strip-symlink-outside' }, function () {
    s.entry({ name: 'prefix/link', type: 'file' }, 'overwrite', function () {
      s.finalize()
    })
  })

  s.pipe(tar.extract(out, { strip: 1, validateSymlinks: false }))
    .on('error', function (err) {
      t.ok(/is not a valid symlink/i.test(err.message))
      t.is(fs.readFileSync(outside, 'utf-8'), 'something', 'outside file untouched')
    })
})
