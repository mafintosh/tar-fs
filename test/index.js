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

test('symlink can not escape through another symlink', function (t) {
  if (win32) {
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(4)

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')
  const secret = path.join(__dirname, 'fixtures', 'symlink-chain', 'secret.txt')

  run(['s1', 's2'], function () { // s1 -> . first, then s2 -> s1/../secret.txt
    run(['s2', 's1'], function () {}) // same, but the helper link is added afterwards
  })

  function run (order, cb) {
    rimraf.sync(path.dirname(out))
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(secret, 'secret')

    const links = { s1: '.', s2: 's1/../secret.txt' }

    const s = tarStream.pack()
    s.entry({ name: order[0], type: 'symlink', linkname: links[order[0]] }, function () {
      s.entry({ name: order[1], type: 'symlink', linkname: links[order[1]] }, function () {
        s.finalize()
      })
    })

    s.pipe(tar.extract(out))
      .on('error', function (err) {
        t.ok(/is not a valid symlink/i.test(err.message), order.join(', '))
        t.absent(readable(path.join(out, 's2')), 'can not read outside file')
        cb()
      })
      .on('finish', function () {
        t.fail('should not extract ' + order.join(', '))
        t.absent(readable(path.join(out, 's2')), 'can not read outside file')
        cb()
      })
  }

  function readable (name) {
    try {
      fs.readFileSync(name)
      return true
    } catch {
      return false
    }
  }
})

test('do not extract invalid paths', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  const cases = [
    [{ name: 'a/../b', type: 'file' }, {}, /is not a valid path/],
    [{ name: '../b', type: 'file' }, {}, /is not a valid path/],
    [{ name: 'a', type: 'file' }, { map: nullName }, /is not a valid path/],
    [{ name: 'a', type: 'symlink', linkname: 'b' }, { map: nullLinkname }, /is not a valid symlink/],
    [{ name: 'a', type: 'symlink', linkname: 'b' }, { map: nullLinkname, validateSymlinks: false }, /is not a valid symlink/],
    [{ name: 'a', type: 'link', linkname: 'b' }, { map: nullLinkname }, /is not a valid hardlink/],
    [{ name: 'a', type: 'link', linkname: 'b/../c' }, {}, /is not a valid hardlink/]
  ]

  t.plan(cases.length * 2)
  loop()

  function loop () {
    if (!cases.length) return

    const [header, opts, expected] = cases.shift()

    rimraf.sync(path.dirname(out))
    fs.mkdirSync(out, { recursive: true })

    const s = tarStream.pack()
    s.entry(header, header.type === 'file' ? 'data' : undefined, function () {
      s.finalize()
    })

    s.pipe(tar.extract(out, opts))
      .on('error', function (err) {
        t.ok(expected.test(err.message), err.message)
        t.alike(fs.readdirSync(out), [], 'nothing extracted')
        loop()
      })
      .on('finish', function () {
        t.fail('should not extract ' + JSON.stringify(header))
        t.fail()
        loop()
      })
  }

  function nullName (header) {
    header.name = 'a\0b'
    return header
  }

  function nullLinkname (header) {
    header.linkname = 'b\0c'
    return header
  }
})

test('symlinks with leading .. inside the root still extract', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(1)

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  rimraf.sync(path.dirname(out))

  const s = tarStream.pack()
  s.entry({ name: 'a/b/file', type: 'file' }, 'data', function () {
    s.entry({ name: 'a/c/link', type: 'symlink', linkname: '../b/file' }, function () {
      s.finalize()
    })
  })

  s.pipe(tar.extract(out))
    .on('finish', function () {
      t.is(fs.readFileSync(path.join(out, 'a', 'c', 'link'), 'utf-8'), 'data')
    })
})

test('failing an entry with pending data does not throw', function (t) {
  t.plan(1)

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  rimraf.sync(path.dirname(out))
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'file'), 'not a directory')

  const s = tarStream.pack()
  s.entry({ name: 'file/child', type: 'file' }, Buffer.alloc(4 * 1024 * 1024), function () {
    s.finalize()
  })
  s.on('error', function () {}) // the pipe forwards the error to the source also

  s.pipe(tar.extract(out))
    .on('error', function (err) {
      t.ok(/is not a valid path/i.test(err.message))
    })
})

test('do not chmod through a pre-existing symlink', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(3)

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')
  const outside = path.join(__dirname, 'fixtures', 'symlink-chain', 'outside')

  rimraf.sync(path.dirname(out))
  fs.mkdirSync(out, { recursive: true })
  fs.mkdirSync(outside, { mode: 0o700 })
  fs.symlinkSync(outside, path.join(out, 'dir'))

  const mtime = fs.statSync(outside).mtime.getTime()

  const s = tarStream.pack()
  s.entry({ name: 'dir', type: 'directory', mode: 0o777, mtime: new Date(0) }, function () {
    s.finalize()
  })

  s.pipe(tar.extract(out, { umask: 0 }))
    .on('finish', function () {
      t.is(fs.statSync(outside).mode & 0o777, 0o700, 'outside mode untouched')
      t.is(fs.statSync(outside).mtime.getTime(), mtime, 'outside mtime untouched')
      t.ok(fs.lstatSync(path.join(out, 'dir')).isDirectory(), 'symlink replaced by a directory')
    })
})

test('invalid links do not remove existing files', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  const cases = [
    [{ name: 'keep', type: 'symlink', linkname: '../../outside' }, /is not a valid symlink/],
    [{ name: 'keep', type: 'link', linkname: 'missing' }, /is not a valid hardlink/]
  ]

  t.plan(cases.length * 2)
  loop()

  function loop () {
    if (!cases.length) return

    const [header, expected] = cases.shift()

    rimraf.sync(path.dirname(out))
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'keep'), 'keep')

    const s = tarStream.pack()
    s.entry(header, function () {
      s.finalize()
    })

    s.pipe(tar.extract(out))
      .on('error', function (err) {
        t.ok(expected.test(err.message), err.message)
        t.is(fs.readFileSync(path.join(out, 'keep'), 'utf-8'), 'keep', 'existing file untouched')
        loop()
      })
  }
})

test('hardlinks when the root is behind a symlink', function (t) {
  if (win32) { // no symlink support on win32 currently. TODO: test if this can be enabled somehow
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(2)

  const real = path.join(__dirname, 'fixtures', 'symlink-chain', 'real')
  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  rimraf.sync(path.dirname(out))
  fs.mkdirSync(real, { recursive: true })
  fs.symlinkSync(real, out)

  const s = tarStream.pack()
  s.entry({ name: 'file', type: 'file' }, 'data', function () {
    s.entry({ name: 'link', type: 'link', linkname: 'file' }, function () {
      s.finalize()
    })
  })

  s.pipe(tar.extract(out))
    .on('finish', function () {
      t.is(fs.readFileSync(path.join(real, 'link'), 'utf-8'), 'data')
      t.is(fs.statSync(path.join(real, 'link')).ino, fs.statSync(path.join(real, 'file')).ino, 'is a hardlink')
    })
})

test('strip skips entries that are stripped away', function (t) {
  t.plan(1)

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  rimraf.sync(path.dirname(out))

  const s = tarStream.pack()
  s.entry({ name: 'README', type: 'file' }, 'skipped', function () {
    s.entry({ name: 'pkg/file', type: 'file' }, 'data', function () {
      s.finalize()
    })
  })

  s.pipe(tar.extract(out, { strip: 1 }))
    .on('finish', function () {
      t.alike(fs.readdirSync(out), ['file'])
    })
})

test('dmode applies to implicitly created directories', function (t) {
  if (win32) {
    t.plan(1)
    t.ok(true)
    return
  }

  t.plan(6)

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  run({ dmode: 0o777, umask: 0 }, 0o777, function () {
    run({ fmode: 0o777, umask: 0 }, 0o755, function () {})
  })

  function run (opts, expected, cb) {
    rimraf.sync(path.dirname(out))
    fs.mkdirSync(path.dirname(out), { recursive: true }) // the root itself is created by the extraction

    const s = tarStream.pack()
    s.entry({ name: 'a/b/file', type: 'file', mode: 0o644 }, 'data', function () {
      s.finalize()
    })

    s.pipe(tar.extract(out, opts))
      .on('finish', function () {
        t.is(fs.statSync(path.join(out, 'a')).mode & 0o777, expected)
        t.is(fs.statSync(path.join(out, 'a', 'b')).mode & 0o777, expected)
        t.is(fs.statSync(out).mode & 0o777, 0o755 & ~process.umask(), 'root untouched')
        cb()
      })
  }
})

test('out of range modes do not throw', function (t) {
  t.plan(2)

  const out = path.join(__dirname, 'fixtures', 'symlink-chain', 'out')

  rimraf.sync(path.dirname(out))

  const s = tarStream.pack()
  s.entry({ name: 'dir', type: 'directory' }, function () {
    s.entry({ name: 'file', type: 'file' }, 'data', function () {
      s.finalize()
    })
  })

  s.pipe(tar.extract(out, { map }))
    .on('finish', function () {
      t.ok(fs.statSync(path.join(out, 'dir')).isDirectory())
      t.ok(fs.statSync(path.join(out, 'file')).isFile())
    })

  function map (header) {
    header.mode = 2 ** 48 + 0o755
    return header
  }
})
