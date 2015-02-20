'use strict';
var assert = require('assert');
var closureCompiler = require('./index');
var gutil = require('gulp-util');
var vinylFile = require('vinyl');
var fs = require('fs');
var path = require('path');

it('should minify JS', function (done) {
	var execFile = function(cmd, args, cb) {
    assert.equal(cmd, 'java');
    assert.equal(args[0], '-jar');
    assert.equal(args[1], '-XX:+TieredCompilation');
    assert.equal(args[2], 'compiler.jar');
    assert.ok(/^--flagfile=/.test(args[3]));
    assert.ok(/^--js_output_file=/.test(args[4]));
    done();
  };
  var options = {
     compilerPath: 'compiler.jar',
     fileName: 'foo.js'
  };

  var stream = closureCompiler(options, execFile);

  var fakeFile = new vinylFile({
    cwd: 'cwd',
    path: 'path',
    contents: new Buffer('abufferwiththiscontent')
  });
  stream.write(fakeFile);
  stream.end()

});

it('source maps are being generated', function (done) {
  var minifiedPath = 'foo.min.js';
  // create file for testing
  fs.openSync(minifiedPath, 'w');
  var execFile = function(cmd, args, options, cb) {
    assert.equal(cmd, 'java');
    assert.equal(args[0], '-jar');
    assert.equal(args[1], '-XX:+TieredCompilation');
    assert.equal(args[2], 'compiler.jar');
    assert.ok(/^--flagfile=/.test(args[3]));
    assert.ok(/^--create_source_map=/.test(args[4]));
    assert.ok(/^--js_output_file=/.test(args[5]));
    cb();
  };
  var options = {
     compilerPath: 'compiler.jar',
     fileName: minifiedPath,
     compilerFlags: {
        create_source_map: minifiedPath + '.map'
     }
  };

  var stream = closureCompiler(options, execFile);
  
  stream.on('data', function(file) {
    assert.equal(file.path, path.join('cwd', minifiedPath));
    done();
  });

  var fakeFile = new vinylFile({
    cwd: 'cwd',
    path: 'foo.js',
    contents: new Buffer('abufferwiththiscontent')
  });
  stream.write(fakeFile);
  stream.end()

});